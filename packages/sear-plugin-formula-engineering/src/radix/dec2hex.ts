/** DEC2HEX converts decimal to hexadecimal. Example: =DEC2HEX(100) returns 64. */
import { engineeringFunction } from '../shared/functionFactory';
import { numeric } from '../shared/arguments';
import { isFormulaError } from '../shared/errors';
import { formatSignedRadix } from '../shared/radix';
export const DEC2HEX = engineeringFunction({
  name: 'DEC2HEX',
  numericDateText: true,
  summary: 'Converts decimal to hexadecimal.',
  example: '=DEC2HEX(100)',
  minArgs: 1,
  maxArgs: 2,
  parameters: ['number', 'places'],
  operation(values) {
    const value = numeric(values[0]!);
    if (isFormulaError(value)) return value;
    let places: number | undefined;
    if (values.length === 2) {
      const p = numeric(values[1]!);
      if (isFormulaError(p)) return p;
      places = Math.trunc(p);
    }
    return formatSignedRadix(Math.trunc(value), 16, places);
  },
});
