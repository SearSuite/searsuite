/** DELTA tests whether two numbers are equal. Example: =DELTA(5,4) returns 0. */
import { engineeringFunction, numbers } from '../shared/functionFactory';
import { isFormulaError } from '../shared/errors';
export const DELTA = engineeringFunction({
  name: 'DELTA',
  numericDateText: true,
  summary: 'Tests two numbers for equality.',
  example: '=DELTA(5,4)',
  minArgs: 1,
  maxArgs: 2,
  parameters: ['number1', 'number2'],
  operation(values) {
    const n = numbers(values.length === 1 ? [values[0]!, 0] : values);
    return isFormulaError(n) ? n : Number(n[0] === n[1]);
  },
});
