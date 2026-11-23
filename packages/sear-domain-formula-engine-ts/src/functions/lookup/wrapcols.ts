import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { wrapVector } from './wrapVector';
/** WRAPCOLS wraps a vector by columns. Example: =WRAPCOLS({1,2,3},2,0). */
export const WRAPCOLS: FormulaFunction = {
  name: 'WRAPCOLS',
  evaluate(args, context) {
    return wrapVector(args, context, true);
  },
};
