import { type FormulaServiceCacheResult } from './FormulaServiceCacheResult';
import { type FormulaGoogleRequest } from './FormulaGoogleRequest';
import { type FormulaValue } from './FormulaValue';

/** Synchronous cache view. Hosts load values outside formula evaluation. */
export interface FormulaGoogleService {
  read(request: FormulaGoogleRequest): FormulaServiceCacheResult<FormulaValue>;
  subscribeInvalidation?(listener: () => void): () => void;
}
