/** IMARGUMENT returns a complex number's angle in radians. Example: =IMARGUMENT("3+4i") returns about 0.9273. */
import { engineeringFunction } from '../shared/functionFactory';
import { parsed } from '../shared/complexOperations';
import { isFormulaError, divisionError } from '../shared/errors';
export const IMARGUMENT = engineeringFunction({
  name: 'IMARGUMENT',
  summary: 'Returns the argument of a complex number.',
  example: '=IMARGUMENT("3+4i")',
  minArgs: 1,
  maxArgs: 1,
  parameters: ['inumber'],
  operation(values) {
    const z = parsed(values[0]!);
    if (isFormulaError(z)) return z;
    return z.real === 0 && z.imaginary === 0 ? divisionError() : Math.atan2(z.imaginary, z.real);
  },
});
