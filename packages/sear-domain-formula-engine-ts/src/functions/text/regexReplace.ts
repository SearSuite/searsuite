import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { integerArg, isFormulaErrorValue, textArg, valueError } from './textFormat/FormulaTextValues';
import { createRegex } from './regexSupport';

/** Replaces all or one regex match. Example: REGEXREPLACE("A12","[0-9]+","#") returns "A#". */
export const REGEXREPLACE: FormulaFunction = {
  name: 'REGEXREPLACE',
  evaluate(args, context) {
    const text = textArg(args, 0, context);
    if (isFormulaErrorValue(text)) return text;
    const pattern = textArg(args, 1, context);
    if (isFormulaErrorValue(pattern)) return pattern;
    const replacement = textArg(args, 2, context);
    if (isFormulaErrorValue(replacement)) return replacement;
    const occurrence = integerArg(args, 3, context, 0);
    if (isFormulaErrorValue(occurrence)) return occurrence;
    const caseMode = integerArg(args, 4, context, 0);
    if (isFormulaErrorValue(caseMode)) return caseMode;
    const regex = createRegex(pattern, caseMode, true);
    if (!regex) return valueError();
    if (occurrence === 0) return text.replace(regex, replacement);
    const matches = [...text.matchAll(regex)];
    const match = occurrence > 0 ? matches[occurrence - 1] : matches[matches.length + occurrence];
    if (!match || match.index === undefined) return text;
    return (
      text.slice(0, match.index) +
      match[0].replace(createRegex(pattern, caseMode)!, replacement) +
      text.slice(match.index + match[0].length)
    );
  },
};
