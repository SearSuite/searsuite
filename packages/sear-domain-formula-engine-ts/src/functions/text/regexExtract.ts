import { FormulaErrorCode, createFormulaError, type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { integerArg, isFormulaErrorValue, textArg, valueError } from './textFormat/FormulaTextValues';
import { createRegex } from './regexSupport';

/** Extracts regex matches or capture groups. Example: REGEXEXTRACT("A12","[0-9]+") returns "12". */
export const REGEXEXTRACT: FormulaFunction = {
  name: 'REGEXEXTRACT',
  evaluate(args, context) {
    const text = textArg(args, 0, context);
    if (isFormulaErrorValue(text)) return text;
    const pattern = textArg(args, 1, context);
    if (isFormulaErrorValue(pattern)) return pattern;
    const returnMode = integerArg(args, 2, context, 0);
    if (isFormulaErrorValue(returnMode)) return returnMode;
    const caseMode = integerArg(args, 3, context, 0);
    if (isFormulaErrorValue(caseMode)) return caseMode;
    if (returnMode < 0 || returnMode > 2) return valueError();
    const regex = createRegex(pattern, caseMode, returnMode === 1);
    if (!regex) return valueError();
    if (returnMode === 1) {
      const matches = [...text.matchAll(regex)].map((match) => [match[0]]);
      return matches.length ? matches : createFormulaError(FormulaErrorCode.NotAvailable);
    }
    const match = regex.exec(text);
    if (!match) return createFormulaError(FormulaErrorCode.NotAvailable);
    return returnMode === 2 ? [match.slice(1).map((value) => value ?? '')] : match[0];
  },
};
