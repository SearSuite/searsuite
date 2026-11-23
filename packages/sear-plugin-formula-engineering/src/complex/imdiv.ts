/** IMDIV divides one complex number by another. Example: =IMDIV("3+4i","5-3i") returns their quotient. */
import { engineeringFunction } from '../shared/functionFactory';
import { parsed } from '../shared/complexOperations';
import { complex, formatComplex, requireSameSuffix } from '../shared/complex';
import { isFormulaError } from '../shared/errors';
export const IMDIV = engineeringFunction({
  name: 'IMDIV',
  summary: 'Divides two complex numbers.',
  example: '=IMDIV("3+4i","5-3i")',
  minArgs: 2,
  maxArgs: 2,
  parameters: ['inumber1', 'inumber2'],
  operation(values) {
    const a = parsed(values[0]!);
    if (isFormulaError(a)) return a;
    const b = parsed(values[1]!);
    if (isFormulaError(b)) return b;
    const suffix = requireSameSuffix([a, b]);
    if (isFormulaError(suffix)) return suffix;
    const result = complex.divide(a, b);
    return isFormulaError(result) ? result : formatComplex(result.real, result.imaginary, suffix);
  },
});
