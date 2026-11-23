/** ERFC.PRECISE returns the precise complementary error function. Example: =ERFC.PRECISE(1) returns about 0.157299. */
import { engineeringFunction, numbers } from '../shared/functionFactory';
import { isFormulaError } from '../shared/errors';
import { erfc } from '@searsuite/sear-foundation-utils';
export const ERFC_PRECISE = engineeringFunction({
  name: 'ERFC.PRECISE',
  summary: 'Returns the precise complementary error function.',
  example: '=ERFC.PRECISE(1)',
  minArgs: 1,
  maxArgs: 1,
  parameters: ['x'],
  operation(values) {
    const n = numbers(values);
    return isFormulaError(n) ? n : erfc(n[0]!);
  },
});
