/** BESSELK returns the modified Bessel function K_n(x). Example: =BESSELK(1.5,1) returns about 0.277388. */
import { engineeringFunction, numbers } from '../shared/functionFactory';
import { isFormulaError, numberError } from '../shared/errors';
import { excelBesselK } from '../shared/excelBesselK';
export const BESSELK = engineeringFunction({
  name: 'BESSELK',
  numericDateText: true,
  summary: 'Returns the modified Bessel function of the second kind.',
  example: '=BESSELK(1.5,1)',
  minArgs: 2,
  maxArgs: 2,
  parameters: ['x', 'n'],
  operation(values) {
    const args = numbers(values);
    if (isFormulaError(args)) return args;
    const [x, n] = args;
    if (x! <= 0 || n! < 0) return numberError();
    const result = excelBesselK(Math.trunc(n!), x!);
    return Number.isFinite(result) ? result : numberError();
  },
});
