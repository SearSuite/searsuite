import {
  FormulaServiceCacheStatus,
  type FormulaCubeQuery,
  type FormulaCubeResult,
  type FormulaCubeService,
  type FormulaServiceCacheResult,
} from '@searsuite/sear-domain-formula-engine';
import { SearError } from '@searsuite/sear-foundation-error';

/** Host-driven OLAP cache. Formula evaluation reads synchronously and never starts connection I/O. */
export class FormulaCubeCache implements FormulaCubeService {
  private readonly values = new Map<string, FormulaServiceCacheResult<FormulaCubeResult>>();
  private readonly pending = new Map<string, Promise<void>>();
  private readonly listeners = new Set<() => void>();
  private generation = 0;
  private destroyed = false;

  public constructor(
    private readonly loader: (query: FormulaCubeQuery) => Promise<FormulaCubeResult>,
    private readonly warn: (message: string, error: unknown) => void = () => void 0,
  ) {}

  public read(query: FormulaCubeQuery): FormulaServiceCacheResult<FormulaCubeResult> {
    return this.values.get(queryKey(query)) ?? { status: FormulaServiceCacheStatus.Unavailable };
  }

  public load(query: FormulaCubeQuery): Promise<void> {
    if (this.destroyed) {
      return Promise.reject(new SearError('Formula cube cache has been destroyed.', { operation: 'load' }));
    }
    const key = queryKey(query);
    const existing = this.pending.get(key);
    if (existing) return existing;
    const generation = this.generation;
    this.values.set(key, { status: FormulaServiceCacheStatus.Pending });
    const request = Promise.resolve()
      .then(() => this.loader(query))
      .then(
        (value) => this.complete(key, generation, { status: FormulaServiceCacheStatus.Ready, value }),
        (error) => {
          this.warn('Formula cube query failed.', error);
          this.complete(key, generation, { status: FormulaServiceCacheStatus.Unavailable });
        },
      );
    this.pending.set(key, request);
    return request;
  }

  public subscribeInvalidation(listener: () => void): () => void {
    if (this.destroyed) return () => void 0;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public clear(): void {
    if (this.destroyed) return;
    this.generation++;
    this.values.clear();
    this.pending.clear();
    this.emitInvalidation();
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.generation++;
    this.values.clear();
    this.pending.clear();
    this.listeners.clear();
  }

  private complete(key: string, generation: number, result: FormulaServiceCacheResult<FormulaCubeResult>): void {
    if (this.destroyed || generation !== this.generation) return;
    this.pending.delete(key);
    this.values.set(key, result);
    this.emitInvalidation();
  }

  private emitInvalidation(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        this.warn('Formula cube cache invalidation listener failed.', error);
      }
    });
  }
}

function queryKey(query: FormulaCubeQuery): string {
  return JSON.stringify(sortObject(query));
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Readonly<Record<string, unknown>>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortObject(entry)]),
  );
}
