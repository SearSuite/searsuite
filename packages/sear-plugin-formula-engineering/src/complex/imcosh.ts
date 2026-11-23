/** IMCOSH returns the hyperbolic cosine of a complex number. Example: =IMCOSH("1+i") returns a complex hyperbolic cosine. */
import { engineeringFunction } from '../shared/functionFactory';
import { nameError } from '../shared/errors';
import { unaryComplex, operations } from '../shared/complexOperations';
import { complex } from '../shared/complex';
const reciprocal = (z: Parameters<typeof complex.divide>[1]) =>
  complex.divide({ ...z, real: 1, imaginary: 0 }, z) as typeof z;
const divide = (a: Parameters<typeof complex.divide>[0], b: Parameters<typeof complex.divide>[1]) =>
  complex.divide(a, b) as typeof a;
export const IMCOSH = engineeringFunction({
  name: 'IMCOSH',
  arityError: nameError,
  summary: 'Returns the hyperbolic cosine of a complex number.',
  example: '=IMCOSH("1+i")',
  minArgs: 1,
  maxArgs: 1,
  parameters: ['inumber'],
  operation(values) {
    return unaryComplex(values[0]!, operations.cosh, true);
  },
});
