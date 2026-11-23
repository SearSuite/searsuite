/** DEC2BIN converts decimal to binary. Example: =DEC2BIN(9) returns 1001. */
import { engineeringFunction } from '../shared/functionFactory';
import { numeric } from '../shared/arguments';
import { isFormulaError } from '../shared/errors';
import { formatSignedRadix } from '../shared/radix';
export const DEC2BIN = engineeringFunction({
  name: 'DEC2BIN',
  numericDateText: true,
  summary: 'Converts decimal to binary.',
  example: '=DEC2BIN(9)',
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
    return formatSignedRadix(Math.trunc(value), 2, places);
  },
});
