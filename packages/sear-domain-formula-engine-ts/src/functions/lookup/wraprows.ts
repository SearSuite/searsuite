import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { wrapVector } from './wrapVector';
/** WRAPROWS wraps a vector by rows. Example: =WRAPROWS({1,2,3},2,0). */
export const WRAPROWS: FormulaFunction = {
  name: 'WRAPROWS',
  evaluate(args, context) {
    return wrapVector(args, context, false);
  },
};
