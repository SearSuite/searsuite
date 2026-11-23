/**
 * IFERROR: Replaces a formula error with a fallback value.
 * Example: =IFERROR(1/0,0) returns 0.
 */
import {
  type FormulaFunction,
  type FormulaArg,
  type FormulaValue,
  type EvalContext,
  FormulaErrorCode,
  createFormulaError,
} from '@searsuite/sear-domain-formula-engine';
import { isFormulaError } from '@searsuite/sear-foundation-utils';
import { readArrayArgument } from '../shared/arrayArgumentValues';
import { replaceConditionalErrors } from './conditionalArrayValues';

export const IFERROR: FormulaFunction = {
  name: 'IFERROR',
  descriptor: {
    version: 1, category: 'Logical', summary: 'Returns a fallback value when an expression has an error.',
    example: '=IFERROR(A1/B1,0)',
    parameters: [
      { name: 'value', description: 'Expression to evaluate.' },
      { name: 'value_if_error', description: 'Value returned if the expression has an error.' },
    ],
  },
  lazy: true,
  evaluate(args: FormulaArg[], context: EvalContext): FormulaValue {
    if (args.length !== 2) return createFormulaError(FormulaErrorCode.Value);
    const value = readArrayArgument(args[0], context);
    return replaceConditionalErrors(value, () => readArrayArgument(args[1], context), isFormulaError);
  },
};
