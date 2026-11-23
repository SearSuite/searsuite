/** BESSELJ returns the Bessel function J_n(x). Example: =BESSELJ(1.9,2) returns about 0.329926. */
import { engineeringFunction, numbers } from '../shared/functionFactory';
import { isFormulaError, numberError } from '../shared/errors';
import { besselJ } from '../shared/specialFunctions';
export const BESSELJ = engineeringFunction({
  name: 'BESSELJ',
  numericDateText: true,
  summary: 'Returns the Bessel function.',
  example: '=BESSELJ(1.9,2)',
  minArgs: 2,
  maxArgs: 2,
  parameters: ['x', 'n'],
  operation(values) {
    const args = numbers(values);
    if (isFormulaError(args)) return args;
    const [x, n] = args;
    return n! < 0 ? numberError() : besselJ(Math.trunc(n!), x!);
  },
});
