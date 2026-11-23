import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { binaryValues, comparable } from '../runtime/googleRuntime';
/** LTE tests whether the first value is no greater than the second. Example: =LTE(2,2) returns TRUE. */
export const LTE: FormulaFunction = {
  name: 'LTE',
  evaluate: (args, context) => binaryValues(args, context, (a, b) => comparable(a) <= comparable(b)),
};
