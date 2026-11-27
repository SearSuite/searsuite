/** OCT2DEC converts octal to decimal. Example: =OCT2DEC("54") returns 44. */
import { engineeringFunction } from '../shared/functionFactory';
import { text } from '../shared/arguments';
import { isFormulaError } from '../shared/errors';
import { parseSignedRadix } from '../shared/radix';
export const OCT2DEC = engineeringFunction({
  name: 'OCT2DEC',
  summary: 'Converts octal to decimal.',
  example: '=OCT2DEC("54")',
  minArgs: 1,
  maxArgs: 1,
  parameters: ['number'],
  operation(values) {
    const source = text(values[0]!);
    if (isFormulaError(source)) return source;
    const value = parseSignedRadix(source, 8);
    if (isFormulaError(value)) return value;
    return value;
  },
});
