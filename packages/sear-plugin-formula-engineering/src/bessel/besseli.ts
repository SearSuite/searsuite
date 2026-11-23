/** BESSELI returns the modified Bessel function I_n(x). Example: =BESSELI(1.5,1) returns about 0.981666. */
import { engineeringFunction, numbers } from '../shared/functionFactory';
import { isFormulaError, numberError } from '../shared/errors';
import { besselI } from '../shared/specialFunctions';
export const BESSELI = engineeringFunction({
  name: 'BESSELI',
  numericDateText: true,
  summary: 'Returns the modified Bessel function.',
  example: '=BESSELI(1.5,1)',
  minArgs: 2,
  maxArgs: 2,
  parameters: ['x', 'n'],
  operation(values) {
    const args = numbers(values);
    if (isFormulaError(args)) return args;
    const [x, n] = args;
    if (n! < 0) return numberError();
    const result = besselI(Math.trunc(n!), x!);
    return Number.isFinite(result) ? result : numberError();
  },
});
