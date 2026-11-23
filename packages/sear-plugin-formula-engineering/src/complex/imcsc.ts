/** IMCSC returns the cosecant of a complex number. Example: =IMCSC("1+i") returns a complex cosecant. */
import { engineeringFunction } from '../shared/functionFactory';
import { nameError } from '../shared/errors';
import { unaryComplex, operations, reciprocalComplex } from '../shared/complexOperations';
export const IMCSC = engineeringFunction({
  name: 'IMCSC',
  computedDateText: false,
  arityError: nameError,
  summary: 'Returns the cosecant of a complex number.',
  example: '=IMCSC("1+i")',
  minArgs: 1,
  maxArgs: 1,
  parameters: ['inumber'],
  operation(values) {
    return unaryComplex(values[0]!, (z) => {
      const sine = operations.sin(z);
      if (z.imaginary === 0 && sine.real !== 0) return { ...sine, real: 1 / sine.real };
      return reciprocalComplex(sine, true);
    }, true);
  },
});
