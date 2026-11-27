/** HEX2OCT converts hexadecimal to octal. Example: =HEX2OCT("F") returns 17. */
import { engineeringFunction } from '../shared/functionFactory';
import { numeric, text } from '../shared/arguments';
import { isFormulaError } from '../shared/errors';
import { formatSignedRadix, parseSignedRadix } from '../shared/radix';
export const HEX2OCT = engineeringFunction({
  name: 'HEX2OCT',
  summary: 'Converts hexadecimal to octal.',
  example: '=HEX2OCT("F")',
  minArgs: 1,
  maxArgs: 2,
  parameters: ['number', 'places'],
  operation(values) {
    const source = text(values[0]!);
    if (isFormulaError(source)) return source;
    const value = parseSignedRadix(source, 16);
    if (isFormulaError(value)) return value;
    let places: number | undefined;
    if (values.length === 2) {
      const p = numeric(values[1]!);
      if (isFormulaError(p)) return p;
      places = Math.trunc(p);
    }
    return formatSignedRadix(value, 8, places);
  },
});
