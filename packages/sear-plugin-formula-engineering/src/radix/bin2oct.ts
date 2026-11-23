/** BIN2OCT converts binary to octal. Example: =BIN2OCT("1001") returns 11. */
import { engineeringFunction } from '../shared/functionFactory';
import { numeric, text } from '../shared/arguments';
import { isFormulaError, numberError } from '../shared/errors';
import { formatSignedRadix, parseSignedRadix } from '../shared/radix';
export const BIN2OCT = engineeringFunction({
  name: 'BIN2OCT',
  summary: 'Converts binary to octal.',
  example: '=BIN2OCT("1001")',
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
    return formatSignedRadix(value, 8, places);
  },
});
