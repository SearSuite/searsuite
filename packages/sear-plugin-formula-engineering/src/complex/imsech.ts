/** IMSECH returns the hyperbolic secant of a complex number. Example: =IMSECH("1+i") returns a complex hyperbolic secant. */
import { engineeringFunction } from '../shared/functionFactory';
import { nameError } from '../shared/errors';
import { unaryComplex, operations, reciprocalComplex } from '../shared/complexOperations';
export const IMSECH = engineeringFunction({
  name: 'IMSECH',
  arityError: nameError,
  summary: 'Returns the hyperbolic secant of a complex number.',
  example: '=IMSECH("1+i")',
  minArgs: 1,
  maxArgs: 1,
  parameters: ['inumber'],
  operation(values) {
    return unaryComplex(values[0]!, (z) => z.imaginary === 0 && Math.abs(z.real) > 1
      ? { ...z, real: 1 / Math.cosh(z.real) }
      : reciprocalComplex(operations.cosh(z)), true);
  },
});
