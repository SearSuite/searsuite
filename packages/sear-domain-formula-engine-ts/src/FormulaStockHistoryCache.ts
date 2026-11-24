import {
  type FormulaError,
  type FormulaStockHistoryRequest,
  type FormulaStockHistoryService,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';
import { AsyncFormulaServiceCache } from './AsyncFormulaServiceCache';

/** Host-driven STOCKHISTORY cache; the loader owns transport, credentials, policy, and normalization. */
export class FormulaStockHistoryCache implements FormulaStockHistoryService {
  readonly #cache: AsyncFormulaServiceCache<string, FormulaValue[][] | FormulaError>;

  public constructor(
    loader: (request: FormulaStockHistoryRequest) => Promise<FormulaValue[][] | FormulaError>,
    warn?: (message: string, error: unknown) => void,
  ) {
    this.#cache = new AsyncFormulaServiceCache(
      async (key) => loader(JSON.parse(key) as FormulaStockHistoryRequest),
      warn,
    );
  }

  public read(request: FormulaStockHistoryRequest) {
    return this.#cache.read(toKey(request));
  }

  public load(request: FormulaStockHistoryRequest): Promise<void> {
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

function toKey(request: FormulaStockHistoryRequest): string {
  return JSON.stringify({ ...request, properties: [...request.properties] });
}
