/** CONVERT changes a number between compatible measurement units. Example: =CONVERT(1,"mi","km") returns 1.609344. */
import { engineeringFunction } from '../shared/functionFactory';
import { numeric, text } from '../shared/arguments';
import { isFormulaError } from '../shared/errors';
import { convertUnit } from '../shared/unitConversion';
export const CONVERT = engineeringFunction({
  name: 'CONVERT',
  summary: 'Converts a number between measurement units.',
  example: '=CONVERT(1,"mi","km")',
  minArgs: 3,
  maxArgs: 3,
  parameters: ['number', 'from_unit', 'to_unit'],
  operation(values) {
    const n = numeric(values[0]!);
    if (isFormulaError(n)) return n;
    const from = text(values[1]!);
    if (isFormulaError(from)) return from;
    const to = text(values[2]!);
    return isFormulaError(to) ? to : convertUnit(n, from, to);
  },
});
