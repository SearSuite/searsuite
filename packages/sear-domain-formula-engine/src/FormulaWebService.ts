import { type FormulaServiceCacheResult } from './FormulaServiceCacheResult';
import { type FormulaError } from './FormulaError';

/** Synchronous view of HTTP response text loaded explicitly by the host. */
export interface FormulaWebService {
  read(url: string): FormulaServiceCacheResult<string | FormulaError>;
  subscribeInvalidation(listener: () => void): () => void;
}
