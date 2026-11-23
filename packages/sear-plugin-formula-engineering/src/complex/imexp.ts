/** IMEXP returns the exponential of a complex number. Example: =IMEXP("1+i") returns a complex exponential. */
import { engineeringFunction } from '../shared/functionFactory';
import { isComputedFunctionArgument } from '../shared/arguments';
import { complex, formatComplex } from '../shared/complex';
import { parsed } from '../shared/complexOperations';
import { isFormulaError } from '../shared/errors';
import { expToSpreadsheetPrecision } from './expToSpreadsheetPrecision';

export const IMEXP = engineeringFunction({
  name: 'IMEXP',
  summary: 'Returns the exponential of a complex number.',
  example: '=IMEXP("1+i")',
  minArgs: 1,
  maxArgs: 1,
  parameters: ['inumber'],
  operation(values, args) {
    const z = parsed(values[0]!);
    if (isFormulaError(z)) return z;
    const result = complex.exp(z);
    const isEulerConstant = z.imaginary === 0 && z.real === 1;
    const computedEuler = isEulerConstant && isComputedFunctionArgument(args[0]);
    const real = computedEuler
      ? Math.floor(Math.E * 1e14) / 1e14
      : isEulerConstant ? Math.E : z.imaginary === 0 ? expToSpreadsheetPrecision(z.real) : result.real;
    return formatComplex(real, result.imaginary, z.suffix, isEulerConstant && !computedEuler);
  },
});
