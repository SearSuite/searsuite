import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { binaryValues, comparable } from '../runtime/googleRuntime';
/** GTE tests whether the first value is at least the second. Example: =GTE(2,2) returns TRUE. */
export const GTE: FormulaFunction = {
  name: 'GTE',
  evaluate: (args, context) => binaryValues(args, context, (a, b) => comparable(a) >= comparable(b)),
};
