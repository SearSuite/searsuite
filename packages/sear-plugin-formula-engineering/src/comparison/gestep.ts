/** GESTEP tests whether a number is at least a threshold. Example: =GESTEP(5,4) returns 1. */
import { engineeringFunction, numbers } from '../shared/functionFactory';
import { isFormulaError } from '../shared/errors';
export const GESTEP = engineeringFunction({
  name: 'GESTEP',
  numericDateText: true,
  summary: 'Tests whether a number is greater than or equal to a threshold.',
  example: '=GESTEP(5,4)',
  minArgs: 1,
  maxArgs: 2,
  parameters: ['number', 'step'],
  operation(values) {
    const n = numbers(values.length === 1 ? [values[0]!, 0] : values);
    return isFormulaError(n) ? n : Number(n[0]! >= n[1]!);
  },
});
