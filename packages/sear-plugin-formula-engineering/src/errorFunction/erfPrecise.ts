/** ERF.PRECISE returns the error function from zero to x. Example: =ERF.PRECISE(1) returns about 0.842701. */
import { engineeringFunction, numbers } from '../shared/functionFactory';
import { isFormulaError } from '../shared/errors';
import { erf } from '@searsuite/sear-foundation-utils';
export const ERF_PRECISE = engineeringFunction({
  name: 'ERF.PRECISE',
  summary: 'Returns the precise error function.',
  example: '=ERF.PRECISE(1)',
  minArgs: 1,
  maxArgs: 1,
  parameters: ['x'],
  operation(values) {
    const n = numbers(values);
    return isFormulaError(n) ? n : erf(n[0]!);
  },
});
