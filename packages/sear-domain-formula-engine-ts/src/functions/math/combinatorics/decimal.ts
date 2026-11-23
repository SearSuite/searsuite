/**
 * DECIMAL: Converts text in a selected radix to a decimal number.
 * Example: =DECIMAL("1010",2) returns 10.
 */
import { type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { integerArgument, isFormulaErrorValue, readText, valueError, numberError } from '../shared/mathUtils';

export const DECIMAL: FormulaFunction = {
  name: 'DECIMAL',
  evaluate(args, context): FormulaValue {
    if (args.length !== 2) return valueError();
    const text = readText(args, 0, context);
    if (isFormulaErrorValue(text)) return text;
    if (text.length > 255) return valueError();
    const radix = integerArgument(args, 1, context);
    if (isFormulaErrorValue(radix)) return radix;
    if (radix < 2 || radix > 36) return numberError();
    const normalized = text.trim().toUpperCase();
    if (normalized === '') return 0;
    if (normalized.startsWith('-')) return numberError();
    const digits = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const unsigned = normalized.replace(/^[+-]/, '');
    if (unsigned === '' || [...unsigned].some((char) => !digits.slice(0, radix).includes(char))) return numberError();
    const result = parseInt(unsigned, radix);
    return Number.isFinite(result) ? result : numberError();
  },
};
