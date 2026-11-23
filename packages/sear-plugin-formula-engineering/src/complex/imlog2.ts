/** IMLOG2 returns the base-2 logarithm of a complex number. Example: =IMLOG2("3+4i") returns a complex logarithm. */
import { engineeringFunction } from '../shared/functionFactory';
import { unaryComplex, operations } from '../shared/complexOperations';
import { complex } from '../shared/complex';
const reciprocal = (z: Parameters<typeof complex.divide>[1]) =>
  complex.divide({ ...z, real: 1, imaginary: 0 }, z) as typeof z;
const divide = (a: Parameters<typeof complex.divide>[0], b: Parameters<typeof complex.divide>[1]) =>
  complex.divide(a, b) as typeof a;
export const IMLOG2 = engineeringFunction({
  name: 'IMLOG2',
  summary: 'Returns the base-2 logarithm of a complex number.',
  example: '=IMLOG2("3+4i")',
  minArgs: 1,
  maxArgs: 1,
  parameters: ['inumber'],
  operation(values) {
    return unaryComplex(values[0]!, (z) => {
      const r = operations.log(z);
      return { ...r, real: r.real / Math.LN2, imaginary: r.imaginary / Math.LN2 };
    });
  },
});
