/** HEX2DEC converts hexadecimal to decimal. Example: =HEX2DEC("A5") returns 165. */
import { engineeringFunction } from '../shared/functionFactory';
import { numeric, text } from '../shared/arguments';
import { isFormulaError, numberError } from '../shared/errors';
import { formatSignedRadix, parseSignedRadix } from '../shared/radix';
export const HEX2DEC = engineeringFunction({
  name: 'HEX2DEC',
  summary: 'Converts hexadecimal to decimal.',
  example: '=HEX2DEC("A5")',
  minArgs: 1,
  maxArgs: 1,
  parameters: ['number'],
  operation(values) {
    const source = text(values[0]!);
    if (isFormulaError(source)) return source;
    const value = parseSignedRadix(source, 16);
    if (isFormulaError(value)) return value;
    return value;
  },
});
