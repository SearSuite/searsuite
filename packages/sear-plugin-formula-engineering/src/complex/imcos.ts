/** IMCOS returns the cosine of a complex number. Example: =IMCOS("1+i") returns a complex cosine. */
import { engineeringFunction } from '../shared/functionFactory';
import { unaryComplexTrig, operations } from '../shared/complexOperations';
import { complex } from '../shared/complex';
const reciprocal = (z: Parameters<typeof complex.divide>[1]) =>
  complex.divide({ ...z, real: 1, imaginary: 0 }, z) as typeof z;
const divide = (a: Parameters<typeof complex.divide>[0], b: Parameters<typeof complex.divide>[1]) =>
  complex.divide(a, b) as typeof a;
export const IMCOS = engineeringFunction({
  name: 'IMCOS',
  summary: 'Returns the cosine of a complex number.',
  example: '=IMCOS("1+i")',
  minArgs: 1,
  maxArgs: 1,
  parameters: ['inumber'],
  operation(values) {
    return unaryComplexTrig(values[0]!, operations.cos);
  },
});
