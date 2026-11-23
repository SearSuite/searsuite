/** BITAND returns the bitwise AND of two 48-bit nonnegative integers. Example: =BITAND(13,25) returns 9. */
import { engineeringFunction } from '../shared/functionFactory';
import { bit48, bitwiseNumbers, integerBit48 } from '../shared/bit48';
import { isFormulaError } from '../shared/errors';
export const BITAND = engineeringFunction({
  name: 'BITAND',
  numericDateText: true,
  summary: 'Returns a bitwise AND.',
  example: '=BITAND(13,25)',
  minArgs: 2,
  maxArgs: 2,
  parameters: ['number1', 'number2'],
  operation(values) {
    const n = bitwiseNumbers(values);
    if (isFormulaError(n)) return n;
    const a = bit48(n[0]!);
    if (isFormulaError(a)) return a;
    const b = integerBit48(n[1]!);
    return isFormulaError(b) ? b : Number(a & b);
  },
});
