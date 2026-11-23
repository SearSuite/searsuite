/** IMAGINARY returns the imaginary coefficient. Example: =IMAGINARY("3+4i") returns 4. */
import { engineeringFunction } from '../shared/functionFactory';
import { parsed } from '../shared/complexOperations';
import { isFormulaError } from '../shared/errors';
export const IMAGINARY = engineeringFunction({
  name: 'IMAGINARY',
  summary: 'Returns the imaginary coefficient.',
  example: '=IMAGINARY("3+4i")',
  minArgs: 1,
  maxArgs: 1,
  parameters: ['inumber'],
  operation(values) {
    const z = parsed(values[0]!);
    return isFormulaError(z) ? z : z.imaginary;
  },
});
