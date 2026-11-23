/** BIN2DEC converts binary to decimal. Example: =BIN2DEC("1100100") returns 100. */
import { engineeringFunction } from '../shared/functionFactory';
import { numeric, text } from '../shared/arguments';
import { isFormulaError, numberError } from '../shared/errors';
import { formatSignedRadix, parseSignedRadix } from '../shared/radix';
export const BIN2DEC = engineeringFunction({
  name: 'BIN2DEC',
  summary: 'Converts binary to decimal.',
  example: '=BIN2DEC("1100100")',
  minArgs: 1,
  maxArgs: 1,
  parameters: ['number'],
  operation(values) {
    const source = text(values[0]!);
    if (isFormulaError(source)) return source;
    const value = parseSignedRadix(source, 2);
    if (isFormulaError(value)) return value;
    return value;
  },
});
