/**
 * BASE: Converts a nonnegative integer to text in a selected radix.
 * Example: =BASE(31,16) returns "1F".
 */
import { FormulaNodeKind, type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { integerArgument, isFormulaErrorValue, numberError, readScalar, valueError } from '../shared/mathUtils';

export const BASE: FormulaFunction = {
  name: 'BASE',
  evaluate(args, context): FormulaValue {
    if (args.length < 2 || args.length > 3) return valueError();
    const rawNumber = readScalar(args, 0, context);
    if (isFormulaErrorValue(rawNumber)) return rawNumber;
    const literal = args[0]?.kind === 'value' && args[0].sourceAst?.kind === FormulaNodeKind.Number
      ? args[0].sourceAst.rawLiteral : undefined;
    if (literal !== undefined && Number(literal) > Number.MAX_SAFE_INTEGER) return numberError();
    if (rawNumber < 0 || rawNumber > Number.MAX_SAFE_INTEGER) return numberError();
    const number = Math.trunc(rawNumber);
    const radix = integerArgument(args, 1, context);
    if (isFormulaErrorValue(radix)) return radix;
    const minLength = integerArgument(args, 2, context, 0);
    if (isFormulaErrorValue(minLength)) return minLength;
    if (radix < 2 || radix > 36 || minLength < 0 || minLength > 255) return numberError();
    const result = number.toString(radix).toUpperCase();
    return result.padStart(minLength, '0');
  },
};
