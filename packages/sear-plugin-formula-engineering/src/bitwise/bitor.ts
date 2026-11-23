/** BITOR returns the bitwise OR of two 48-bit nonnegative integers. Example: =BITOR(23,10) returns 31. */
import { engineeringFunction } from '../shared/functionFactory';
import { bit48, bitwiseNumbers, integerBit48 } from '../shared/bit48';
import { isFormulaError } from '../shared/errors';
export const BITOR = engineeringFunction({
  name: 'BITOR',
  numericDateText: true,
  summary: 'Returns a bitwise OR.',
  example: '=BITOR(23,10)',
  minArgs: 2,
  maxArgs: 2,
  parameters: ['number1', 'number2'],
  operation(values) {
    const n = bitwiseNumbers(values);
    if (isFormulaError(n)) return n;
    const a = bit48(n[0]!);
    if (isFormulaError(a)) return a;
    const b = integerBit48(n[1]!);
    return isFormulaError(b) ? b : Number(a | b);
  },
});
