/** IMSIN returns the sine of a complex number. Example: =IMSIN("1+i") returns a complex sine. */
import { engineeringFunction } from '../shared/functionFactory';
import { unaryComplexTrig, operations } from '../shared/complexOperations';
import { complex } from '../shared/complex';
const reciprocal = (z: Parameters<typeof complex.divide>[1]) =>
  complex.divide({ ...z, real: 1, imaginary: 0 }, z) as typeof z;
const divide = (a: Parameters<typeof complex.divide>[0], b: Parameters<typeof complex.divide>[1]) =>
  complex.divide(a, b) as typeof a;
export const IMSIN = engineeringFunction({
  name: 'IMSIN',
  summary: 'Returns the sine of a complex number.',
  example: '=IMSIN("1+i")',
  minArgs: 1,
  maxArgs: 1,
  parameters: ['inumber'],
  operation(values) {
    return unaryComplexTrig(values[0]!, operations.sin);
  },
});
