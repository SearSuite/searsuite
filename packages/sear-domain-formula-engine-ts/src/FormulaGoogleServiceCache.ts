import {
  type FormulaGoogleRequest,
  type FormulaGoogleService,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';
import { AsyncFormulaServiceCache } from './AsyncFormulaServiceCache';

/** Host-driven cache for AI, import, finance, and translation formulas. */
export class FormulaGoogleServiceCache implements FormulaGoogleService {
  readonly #cache: AsyncFormulaServiceCache<string, FormulaValue>;

  public constructor(
    loader: (request: FormulaGoogleRequest) => Promise<FormulaValue>,
    warn?: (message: string, error: unknown) => void,
  ) {
    this.#cache = new AsyncFormulaServiceCache((key) => loader(JSON.parse(key) as FormulaGoogleRequest), warn);
  }

  public read(request: FormulaGoogleRequest) {
    return this.#cache.read(toKey(request));
  }
  public load(request: FormulaGoogleRequest): Promise<void> {
    return this.#cache.load(toKey(request));
  }
  public subscribeInvalidation(listener: () => void): () => void {
    return this.#cache.subscribeInvalidation(listener);
  }
  public clear(): void {
    this.#cache.clear();
  }
  public destroy(): void {
    this.#cache.destroy();
  }
}

function toKey(request: FormulaGoogleRequest): string {
  return JSON.stringify({ functionName: request.functionName.toUpperCase(), arguments: request.arguments });
}
