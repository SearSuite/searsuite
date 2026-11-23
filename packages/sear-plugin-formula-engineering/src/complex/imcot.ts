/** IMCOT returns the cotangent of a complex number. Example: =IMCOT("1+i") returns a complex cotangent. */
import { engineeringFunction } from '../shared/functionFactory';
import { nameError } from '../shared/errors';
import { unaryComplex, operations } from '../shared/complexOperations';
export const IMCOT = engineeringFunction({
  name: 'IMCOT',
  arityError: nameError,
  summary: 'Returns the cotangent of a complex number.',
  example: '=IMCOT("1+i")',
  minArgs: 1,
  maxArgs: 1,
  parameters: ['inumber'],
  operation(values) {
    return unaryComplex(values[0]!, operations.cot, (z) => z.imaginary === 0);
  },
});
