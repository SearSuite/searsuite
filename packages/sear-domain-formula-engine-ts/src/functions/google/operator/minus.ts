import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { binaryNumber } from '../runtime/googleRuntime';
/** MINUS subtracts the second value from the first. Example: =MINUS(5,2) returns 3. */
export const MINUS: FormulaFunction = {
  name: 'MINUS',
  evaluate: (args, context) => binaryNumber(args, context, (a, b) => a - b),
};
