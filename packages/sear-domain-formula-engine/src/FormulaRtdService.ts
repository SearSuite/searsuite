import { type FormulaRtdKey } from './FormulaRtdKey';
import { type FormulaServiceCacheResult } from './FormulaServiceCacheResult';
import { type FormulaValue } from './FormulaValue';

/** Host-owned RTD service. */
export interface FormulaRtdService {
  read(key: FormulaRtdKey): FormulaServiceCacheResult<FormulaValue>;
  load?(key: FormulaRtdKey): Promise<void>;
  subscribeInvalidation(listener: () => void): () => void;
}
