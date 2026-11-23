import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { unaryNumber } from '../runtime/googleRuntime';
/** UPLUS returns the numeric value unchanged. Example: =UPLUS("3") returns 3. */
export const UPLUS: FormulaFunction = {
  name: 'UPLUS',
  evaluate: (args, context) => unaryNumber(args, context, (value) => value),
};
