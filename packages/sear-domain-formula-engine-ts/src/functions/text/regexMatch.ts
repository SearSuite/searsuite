import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { isFormulaText } from '@searsuite/sear-foundation-utils';
import { isFormulaErrorValue, scalarValueArg, textArg, valueError } from './textFormat/FormulaTextValues';

/** REGEXMATCH tests whether text matches a regular expression. Example: =REGEXMATCH("A12","[0-9]+") returns TRUE. */
export const REGEXMATCH: FormulaFunction = {
  name: 'REGEXMATCH',
  evaluate(args, context) {
    if (args.length !== 2) return valueError();
    const input = scalarValueArg(args, 0, context);
    if (isFormulaErrorValue(input)) return input;
    const text = isFormulaText(input) ? input.value : input;
    if (typeof text !== 'string') return valueError();
    const pattern = textArg(args, 1, context);
    if (isFormulaErrorValue(pattern)) return pattern;
    if (/\(\?(?:[=!]|<[=!]|>)/.test(pattern) || /\\[1-9]/.test(pattern)) return valueError();
    try {
      return new RegExp(pattern, 'u').test(text);
    } catch {
      return valueError();
    }
  },
};
