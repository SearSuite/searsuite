import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { unaryNumber } from '../runtime/googleRuntime';
/** UMINUS reverses a number's sign. Example: =UMINUS(3) returns -3. */
export const UMINUS: FormulaFunction = {
  name: 'UMINUS',
  evaluate: (args, context) => unaryNumber(args, context, (value) => -value),
};
