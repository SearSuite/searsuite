/** IMSQRT returns the square root of a complex number. Example: =IMSQRT("1+i") returns a complex square root. */
import { engineeringFunction } from '../shared/functionFactory';
import { unaryComplex, operations } from '../shared/complexOperations';
import { complex } from '../shared/complex';
const reciprocal = (z: Parameters<typeof complex.divide>[1]) =>
  complex.divide({ ...z, real: 1, imaginary: 0 }, z) as typeof z;
const divide = (a: Parameters<typeof complex.divide>[0], b: Parameters<typeof complex.divide>[1]) =>
  complex.divide(a, b) as typeof a;
export const IMSQRT = engineeringFunction({
  name: 'IMSQRT',
  summary: 'Returns the square root of a complex number.',
  example: '=IMSQRT("1+i")',
  minArgs: 1,
  maxArgs: 1,
  parameters: ['inumber'],
  operation(values) {
    return unaryComplex(values[0]!, operations.sqrt);
  },
});
