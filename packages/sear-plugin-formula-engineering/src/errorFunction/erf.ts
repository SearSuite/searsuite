/** ERF returns the error function between lower and optional upper bounds. Example: =ERF(1) returns about 0.842701. */
import { engineeringFunction, numbers } from '../shared/functionFactory';
import { isFormulaError } from '../shared/errors';
import { erf as calculateErf, erfc } from '@searsuite/sear-foundation-utils';
export const ERF = engineeringFunction({
  name: 'ERF',
  numericDateText: true,
  summary: 'Returns the error function.',
  example: '=ERF(1)',
  minArgs: 1,
  maxArgs: 2,
  parameters: ['lower_limit', 'upper_limit'],
  operation(values) {
    const n = numbers(values);
    if (isFormulaError(n)) return n;
    if (values.length === 1) return calculateErf(n[0]!);
    const [lower, upper] = n;
    if (lower! >= 0 && upper! >= 0) return erfc(lower!) - erfc(upper!);
    if (lower! <= 0 && upper! <= 0) return erfc(-upper!) - erfc(-lower!);
    return calculateErf(upper!) - calculateErf(lower!);
  },
});
