/** ERFC returns the complementary error function. Example: =ERFC(1) returns about 0.157299. */
import { engineeringFunction, numbers } from '../shared/functionFactory';
import { isFormulaError } from '../shared/errors';
import { erfc } from '@searsuite/sear-foundation-utils';
export const ERFC = engineeringFunction({
  name: 'ERFC',
  numericDateText: true,
  summary: 'Returns the complementary error function.',
  example: '=ERFC(1)',
  minArgs: 1,
  maxArgs: 1,
  parameters: ['x'],
  operation(values) {
    const n = numbers(values);
    return isFormulaError(n) ? n : erfc(n[0]!);
  },
});
