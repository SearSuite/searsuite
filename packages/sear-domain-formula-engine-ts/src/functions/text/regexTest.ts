import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { integerArg, isFormulaErrorValue, textArg, valueError } from './textFormat/FormulaTextValues';
import { createRegex } from './regexSupport';

/** Tests whether text matches a regular expression. Example: REGEXTEST("A12","[0-9]+") returns TRUE. */
export const REGEXTEST: FormulaFunction = {
  name: 'REGEXTEST',
  evaluate(args, context) {
    const text = textArg(args, 0, context);
    if (isFormulaErrorValue(text)) return text;
    const pattern = textArg(args, 1, context);
    if (isFormulaErrorValue(pattern)) return pattern;
    const mode = integerArg(args, 2, context, 0);
    if (isFormulaErrorValue(mode)) return mode;
    const regex = createRegex(pattern, mode);
    return regex ? regex.test(text) : valueError();
  },
};
