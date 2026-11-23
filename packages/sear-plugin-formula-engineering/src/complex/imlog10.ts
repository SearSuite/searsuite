/** IMLOG10 returns the base-10 logarithm of a complex number. Example: =IMLOG10("3+4i") returns a complex logarithm. */
import { engineeringFunction } from '../shared/functionFactory';
import { unaryComplex, operations } from '../shared/complexOperations';
import { complex } from '../shared/complex';
const reciprocal = (z: Parameters<typeof complex.divide>[1]) =>
  complex.divide({ ...z, real: 1, imaginary: 0 }, z) as typeof z;
const divide = (a: Parameters<typeof complex.divide>[0], b: Parameters<typeof complex.divide>[1]) =>
  complex.divide(a, b) as typeof a;
export const IMLOG10 = engineeringFunction({
  name: 'IMLOG10',
  summary: 'Returns the base-10 logarithm of a complex number.',
  example: '=IMLOG10("3+4i")',
  minArgs: 1,
  maxArgs: 1,
  parameters: ['inumber'],
  operation(values) {
    return unaryComplex(values[0]!, (z) => {
      const r = operations.log(z);
      return { ...r, real: Math.log10(Math.hypot(z.real, z.imaginary)), imaginary: r.imaginary / Math.LN10 };
    });
  },
});
