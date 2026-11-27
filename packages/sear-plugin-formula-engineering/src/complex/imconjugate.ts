/** IMCONJUGATE returns the complex conjugate. Example: =IMCONJUGATE("3+4i") returns a 3-4i. */
import { engineeringFunction } from '../shared/functionFactory';
import { unaryComplex } from '../shared/complexOperations';
import { complex } from '../shared/complex';
const reciprocal = (z: Parameters<typeof complex.divide>[1]) =>
  complex.divide({ ...z, real: 1, imaginary: 0 }, z) as typeof z;
const divide = (a: Parameters<typeof complex.divide>[0], b: Parameters<typeof complex.divide>[1]) =>
  complex.divide(a, b) as typeof a;
export const IMCONJUGATE = engineeringFunction({
  name: 'IMCONJUGATE',
  summary: 'Returns the complex conjugate.',
  example: '=IMCONJUGATE("3+4i")',
  minArgs: 1,
  maxArgs: 1,
  parameters: ['inumber'],
  operation(values) {
    return unaryComplex(values[0]!, (z) => ({ ...z, imaginary: -z.imaginary }));
  },
});
