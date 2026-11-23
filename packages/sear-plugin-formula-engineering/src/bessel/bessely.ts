/** BESSELY returns the Bessel function Y_n(x). Example: =BESSELY(2.5,1) returns about 0.145918. */
import { engineeringFunction, numbers } from '../shared/functionFactory';
import { isFormulaError, numberError } from '../shared/errors';
import { besselY } from '../shared/specialFunctions';
export const BESSELY = engineeringFunction({
  name: 'BESSELY',
  numericDateText: true,
  summary: 'Returns the Bessel function of the second kind.',
  example: '=BESSELY(2.5,1)',
  minArgs: 2,
  maxArgs: 2,
  parameters: ['x', 'n'],
  operation(values) {
    const args = numbers(values);
    if (isFormulaError(args)) return args;
    const [x, n] = args;
    if (x! <= 0 || n! < 0) return numberError();
    const result = besselY(Math.trunc(n!), x!);
    return Number.isFinite(result) ? result : numberError();
  },
});
