import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { AVERAGE_WEIGHTED } from '../../math/statistics/averageWeighted';
/** AVERAGE.WEIGHTED is the dotted Google Sheets alias. Example: =AVERAGE.WEIGHTED({10,20},{1,3}) returns 17.5. */
export const AVERAGE_WEIGHTED_DOTTED: FormulaFunction = { ...AVERAGE_WEIGHTED, name: 'AVERAGE.WEIGHTED' };
