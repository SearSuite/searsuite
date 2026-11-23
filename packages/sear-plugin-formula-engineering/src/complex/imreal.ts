/** IMREAL returns the real coefficient. Example: =IMREAL("6-9i") returns 6. */
import { engineeringFunction } from '../shared/functionFactory';
import { parsed } from '../shared/complexOperations';
import { isFormulaError } from '../shared/errors';
export const IMREAL = engineeringFunction({
  name: 'IMREAL',
  summary: 'Returns the real coefficient.',
  example: '=IMREAL("6-9i")',
  minArgs: 1,
  maxArgs: 1,
  parameters: ['inumber'],
  operation(values) {
    const z = parsed(values[0]!);
    return isFormulaError(z) ? z : z.real;
  },
});
