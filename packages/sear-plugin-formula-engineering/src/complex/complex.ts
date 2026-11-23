/** COMPLEX creates Excel complex-number text from real and imaginary coefficients. Example: =COMPLEX(3,4) returns "3+4i". */
import { engineeringFunction } from '../shared/functionFactory';
import { numeric, text } from '../shared/arguments';
import { formatComplex } from '../shared/complex';
import { isFormulaError, valueError } from '../shared/errors';
export const COMPLEX = engineeringFunction({
  name: 'COMPLEX',
  numericDateText: true,
  summary: 'Creates a complex number.',
  example: '=COMPLEX(3,4)',
  minArgs: 2,
  maxArgs: 3,
  parameters: ['real_num', 'i_num', 'suffix'],
  operation(values) {
    const real = numeric(values[0]!);
    if (isFormulaError(real)) return real;
    const imaginary = numeric(values[1]!);
    if (isFormulaError(imaginary)) return imaginary;
    let suffix: 'i' | 'j' = 'i';
    if (values.length === 3) {
      const result = text(values[2]!);
      if (isFormulaError(result)) return result;
      if (result !== 'i' && result !== 'j') return valueError();
      suffix = result;
    }
    return formatComplex(real, imaginary, suffix);
  },
});
