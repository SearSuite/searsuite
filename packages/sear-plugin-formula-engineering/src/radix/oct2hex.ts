/** OCT2HEX converts octal to hexadecimal. Example: =OCT2HEX("100") returns 40. */
import { engineeringFunction } from '../shared/functionFactory';
import { numeric, text } from '../shared/arguments';
import { isFormulaError, numberError } from '../shared/errors';
import { formatSignedRadix, parseSignedRadix } from '../shared/radix';
export const OCT2HEX = engineeringFunction({
  name: 'OCT2HEX',
  summary: 'Converts octal to hexadecimal.',
  example: '=OCT2HEX("100")',
  minArgs: 1,
  maxArgs: 2,
  parameters: ['number', 'places'],
  operation(values) {
    const source = text(values[0]!);
    if (isFormulaError(source)) return source;
    const value = parseSignedRadix(source, 8);
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
