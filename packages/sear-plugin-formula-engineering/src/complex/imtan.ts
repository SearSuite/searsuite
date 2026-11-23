/** IMTAN returns the tangent of a complex number. Example: =IMTAN("1+i") returns a complex tangent. */
import { engineeringFunction } from '../shared/functionFactory';
import { nameError } from '../shared/errors';
import { unaryComplex, operations } from '../shared/complexOperations';
export const IMTAN = engineeringFunction({
  name: 'IMTAN',
  arityError: nameError,
  summary: 'Returns the tangent of a complex number.',
  example: '=IMTAN("1+i")',
  minArgs: 1,
  maxArgs: 1,
  parameters: ['inumber'],
  operation(values) {
    return unaryComplex(values[0]!, operations.tan, (z) => z.imaginary === 0 && Math.abs(z.real) < 1e12);
  },
});
