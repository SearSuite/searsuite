/** IMSEC returns the secant of a complex number. Example: =IMSEC("1+i") returns a complex secant. */
import { engineeringFunction } from '../shared/functionFactory';
import { unaryComplex, operations, reciprocalComplex } from '../shared/complexOperations';
export const IMSEC = engineeringFunction({
  name: 'IMSEC',
  summary: 'Returns the secant of a complex number.',
  example: '=IMSEC("1+i")',
  minArgs: 1,
  maxArgs: 1,
  parameters: ['inumber'],
  operation(values) {
    return unaryComplex(values[0]!, (z) => reciprocalComplex(operations.cos(z)), true);
  },
});
