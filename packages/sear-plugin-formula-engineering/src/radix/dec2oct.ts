/** DEC2OCT converts decimal to octal. Example: =DEC2OCT(58) returns 72. */
import { engineeringFunction } from '../shared/functionFactory';
import { numeric } from '../shared/arguments';
import { isFormulaError } from '../shared/errors';
import { formatSignedRadix } from '../shared/radix';
export const DEC2OCT = engineeringFunction({
  name: 'DEC2OCT',
  numericDateText: true,
  summary: 'Converts decimal to octal.',
  example: '=DEC2OCT(58)',
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
    return formatSignedRadix(Math.trunc(value), 8, places);
  },
});
