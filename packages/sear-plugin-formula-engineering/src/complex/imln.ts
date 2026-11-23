/** IMLN returns the natural logarithm of a complex number. Example: =IMLN("3+4i") returns a complex logarithm. */
import { engineeringFunction } from '../shared/functionFactory';
import { unaryComplex, operations } from '../shared/complexOperations';
import { complex } from '../shared/complex';
const reciprocal = (z: Parameters<typeof complex.divide>[1]) =>
  complex.divide({ ...z, real: 1, imaginary: 0 }, z) as typeof z;
const divide = (a: Parameters<typeof complex.divide>[0], b: Parameters<typeof complex.divide>[1]) =>
  complex.divide(a, b) as typeof a;
export const IMLN = engineeringFunction({
  name: 'IMLN',
  summary: 'Returns the natural logarithm of a complex number.',
  example: '=IMLN("3+4i")',
  minArgs: 1,
  maxArgs: 1,
  parameters: ['inumber'],
  operation(values) {
    return unaryComplex(values[0]!, operations.log);
  },
});
