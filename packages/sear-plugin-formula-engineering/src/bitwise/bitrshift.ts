/** BITRSHIFT shifts a 48-bit integer right, or left for a negative shift. Example: =BITRSHIFT(16,2) returns 4. */
import { engineeringFunction } from '../shared/functionFactory';
import { bit48, bitwiseNumbers, shiftedBit48 } from '../shared/bit48';
import { isFormulaError } from '../shared/errors';
export const BITRSHIFT = engineeringFunction({
  name: 'BITRSHIFT',
  numericDateText: true,
  summary: 'Shifts bits right.',
  example: '=BITRSHIFT(16,2)',
  minArgs: 2,
  maxArgs: 2,
  parameters: ['number', 'shift_amount'],
  operation(values) {
    const n = bitwiseNumbers(values);
    if (isFormulaError(n)) return n;
    const a = bit48(n[0]!);
    return isFormulaError(a) ? a : shiftedBit48(a, -Math.trunc(n[1]!));
  },
});
