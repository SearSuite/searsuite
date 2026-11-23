/** IMSUB subtracts the second complex number from the first. Example: =IMSUB("13+4i","5+3i") returns "8+i". */
import { engineeringFunction } from '../shared/functionFactory';
import { parsed } from '../shared/complexOperations';
import { complex, formatComplex, requireSameSuffix, roundComputedComplexInteger } from '../shared/complex';
import { isFormulaError } from '../shared/errors';
export const IMSUB = engineeringFunction({
  name: 'IMSUB',
  summary: 'Subtracts two complex numbers.',
  example: '=IMSUB("13+4i","5+3i")',
  minArgs: 2,
  maxArgs: 2,
  parameters: ['inumber1', 'inumber2'],
  operation(values, args) {
    const a = parsed(values[0]!);
    if (isFormulaError(a)) return a;
    const b = parsed(values[1]!);
    if (isFormulaError(b)) return b;
    const suffix = requireSameSuffix([a, b]);
    if (isFormulaError(suffix)) return suffix;
    const result = complex.subtract(a, b);
    return formatComplex(roundComputedComplexInteger(result.real), result.imaginary, suffix);
  },
});
