/** IMSINH returns the hyperbolic sine of a complex number. Example: =IMSINH("1+i") returns a complex hyperbolic sine. */
import { engineeringFunction } from '../shared/functionFactory';
import { nameError } from '../shared/errors';
import { unaryComplex, operations } from '../shared/complexOperations';
import { complex } from '../shared/complex';
const reciprocal = (z: Parameters<typeof complex.divide>[1]) =>
  complex.divide({ ...z, real: 1, imaginary: 0 }, z) as typeof z;
const divide = (a: Parameters<typeof complex.divide>[0], b: Parameters<typeof complex.divide>[1]) =>
  complex.divide(a, b) as typeof a;
export const IMSINH = engineeringFunction({
  name: 'IMSINH',
  arityError: nameError,
  summary: 'Returns the hyperbolic sine of a complex number.',
  example: '=IMSINH("1+i")',
  minArgs: 1,
  maxArgs: 1,
  parameters: ['inumber'],
  operation(values) {
    return unaryComplex(values[0]!, operations.sinh, true);
  },
});
