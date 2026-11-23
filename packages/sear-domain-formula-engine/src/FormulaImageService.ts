import { type FormulaImageResource } from './FormulaImageResource';
import { type FormulaServiceCacheResult } from './FormulaServiceCacheResult';

/** Host-owned image loader used by IMAGE. */
export interface FormulaImageService {
  read(source: string): FormulaServiceCacheResult<FormulaImageResource>;
  load?(source: string): Promise<void>;
  subscribeInvalidation(listener: () => void): () => void;
}
