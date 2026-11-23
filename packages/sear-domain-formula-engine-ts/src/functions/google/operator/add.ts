import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { binaryNumber } from '../runtime/googleRuntime';
/** ADD returns the sum of two values. Example: =ADD(2,3) returns 5. */
export const ADD: FormulaFunction = {
  name: 'ADD',
  evaluate: (args, context) => binaryNumber(args, context, (a, b) => a + b),
};
