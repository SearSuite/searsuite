/** BIN2HEX converts binary to hexadecimal. Example: =BIN2HEX("11111011") returns FB. */
import { engineeringFunction } from '../shared/functionFactory';
import { numeric, text } from '../shared/arguments';
import { isFormulaError } from '../shared/errors';
import { formatSignedRadix, parseSignedRadix } from '../shared/radix';
export const BIN2HEX = engineeringFunction({
  name: 'BIN2HEX',
  summary: 'Converts binary to hexadecimal.',
  example: '=BIN2HEX("11111011")',
  minArgs: 1,
  maxArgs: 2,
  parameters: ['number', 'places'],
  operation(values) {
    const source = text(values[0]!);
    if (isFormulaError(source)) return source;
    const value = parseSignedRadix(source, 2);
    if (isFormulaError(value)) return value;
    let places: number | undefined;
    if (values.length === 2) {
      const p = numeric(values[1]!);
      if (isFormulaError(p)) return p;
      places = Math.trunc(p);
    }
    return formatSignedRadix(value, 16, places);
  },
});
