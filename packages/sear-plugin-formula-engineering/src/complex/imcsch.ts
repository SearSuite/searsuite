/** IMCSCH returns the hyperbolic cosecant of a complex number. Example: =IMCSCH("1+i") returns a complex hyperbolic cosecant. */
import { engineeringFunction } from '../shared/functionFactory';
import { nameError } from '../shared/errors';
import { unaryComplex, operations, reciprocalComplex } from '../shared/complexOperations';
export const IMCSCH = engineeringFunction({
  name: 'IMCSCH',
  computedDateText: false,
  arityError: nameError,
  summary: 'Returns the hyperbolic cosecant of a complex number.',
  example: '=IMCSCH("1+i")',
  minArgs: 1,
  maxArgs: 1,
  parameters: ['inumber'],
  operation(values) {
    return unaryComplex(values[0]!, (z) => {
      const sine = operations.sinh(z);
      if (z.imaginary === 0 && z.real > 0 && Number.isFinite(sine.real) && sine.real !== 0)
        return { ...sine, real: 1 / sine.real, imaginary: 0 };
      return reciprocalComplex(sine, true);
    }, true);
  },
});
