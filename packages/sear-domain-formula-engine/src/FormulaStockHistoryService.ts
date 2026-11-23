import { type FormulaServiceCacheResult } from './FormulaServiceCacheResult';
import { type FormulaError } from './FormulaError';
import { type FormulaStockHistoryRequest } from './FormulaStockHistoryRequest';
import { type FormulaValue } from './FormulaValue';

/** Synchronous view over historical market data loaded outside formula evaluation. */
export interface FormulaStockHistoryService {
  read(request: FormulaStockHistoryRequest): FormulaServiceCacheResult<FormulaValue[][] | FormulaError>;
  subscribeInvalidation(listener: () => void): () => void;
}
