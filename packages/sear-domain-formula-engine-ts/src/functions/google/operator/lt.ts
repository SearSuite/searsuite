import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { binaryValues, comparable } from '../runtime/googleRuntime';
/** LT tests whether the first value is smaller. Example: =LT(2,3) returns TRUE. */
export const LT: FormulaFunction = {
  name: 'LT',
  evaluate: (args, context) => binaryValues(args, context, (a, b) => comparable(a) < comparable(b)),
};
