import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { binaryNumber } from '../runtime/googleRuntime';
/** MULTIPLY multiplies two values. Example: =MULTIPLY(3,4) returns 12. */
export const MULTIPLY: FormulaFunction = {
  name: 'MULTIPLY',
  evaluate: (args, context) => binaryNumber(args, context, (a, b) => a * b),
};
