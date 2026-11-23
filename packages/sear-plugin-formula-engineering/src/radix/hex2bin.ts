/** HEX2BIN converts hexadecimal to binary. Example: =HEX2BIN("F") returns 1111. */
import { engineeringFunction } from '../shared/functionFactory';
import { numeric, text } from '../shared/arguments';
import { isFormulaError, numberError } from '../shared/errors';
import { formatSignedRadix, parseSignedRadix } from '../shared/radix';
export const HEX2BIN = engineeringFunction({
  name: 'HEX2BIN',
  summary: 'Converts hexadecimal to binary.',
  example: '=HEX2BIN("F")',
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
    return formatSignedRadix(value, 2, places);
  },
});
