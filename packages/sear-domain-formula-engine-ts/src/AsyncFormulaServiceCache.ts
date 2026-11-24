import { FormulaServiceCacheStatus, type FormulaServiceCacheResult } from '@searsuite/sear-domain-formula-engine';
import { SearError } from '@searsuite/sear-foundation-error';

/** Host-driven async cache. read() never starts work or returns a Promise. */
export class AsyncFormulaServiceCache<TKey, TValue> {
  readonly #loader: (key: TKey) => Promise<TValue>;
  readonly #warn: (message: string, error: unknown) => void;

  readonly #values = new Map<TKey, FormulaServiceCacheResult<TValue>>();
  readonly #pending = new Map<TKey, Promise<void>>();
  readonly #listeners = new Set<() => void>();
  #generation = 0;
  #destroyed = false;

  public constructor(
    loader: (key: TKey) => Promise<TValue>,
    warn: (message: string, error: unknown) => void = () => void 0,
  ) {
    this.#loader = loader;
    this.#warn = warn;
  }

  public read(key: TKey): FormulaServiceCacheResult<TValue> {
    return this.#values.get(key) ?? { status: FormulaServiceCacheStatus.Unavailable };
  }

  /** Loads one value, deduplicating concurrent requests for the same key. */
  public load(key: TKey): Promise<void> {
    if (this.#destroyed) {
      return Promise.reject(new SearError('Formula service cache has been destroyed.', { operation: 'load' }));
    }
    const existing = this.#pending.get(key);
    if (existing) return existing;
    const generation = this.#generation;
    this.#values.set(key, { status: FormulaServiceCacheStatus.Pending });
    const request = Promise.resolve()
      .then(() => this.#loader(key))
      .then(
        (value) => this.#complete(key, generation, { status: FormulaServiceCacheStatus.Ready, value }),
        () => this.#complete(key, generation, { status: FormulaServiceCacheStatus.Unavailable }),
      );
    this.#pending.set(key, request);
    return request;
  }

  public subscribeInvalidation(listener: () => void): () => void {
    if (this.#destroyed) return () => void 0;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Drops values and ignores results from requests started before this boundary. */
  public clear(): void {
    if (this.#destroyed) return;
    this.#generation++;
    this.#values.clear();
    this.#pending.clear();
    this.#emitInvalidation();
  }

  public destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#generation++;
    this.#values.clear();
    this.#pending.clear();
    this.#listeners.clear();
  }

  #complete(key: TKey, generation: number, result: FormulaServiceCacheResult<TValue>): void {
    if (generation !== this.#generation) return;
    this.#pending.delete(key);
    this.#values.set(key, result);
    this.#emitInvalidation();
  }

  #emitInvalidation(): void {
    this.#listeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        this.#warn('Formula service-cache invalidation listener failed.', error);
      }
    });
  }
}
