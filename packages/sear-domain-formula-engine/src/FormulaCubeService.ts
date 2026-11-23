import { type FormulaCubeQuery } from './FormulaCubeQuery';
import { type FormulaCubeResult } from './FormulaCubeResult';
import { type FormulaServiceCacheResult } from './FormulaServiceCacheResult';

/** Host-owned synchronous OLAP cache view. Loading and connection I/O stay outside evaluation. */
export interface FormulaCubeService {
  read(query: FormulaCubeQuery): FormulaServiceCacheResult<FormulaCubeResult>;
  load?(query: FormulaCubeQuery): Promise<void>;
  subscribeInvalidation(listener: () => void): () => void;
}
