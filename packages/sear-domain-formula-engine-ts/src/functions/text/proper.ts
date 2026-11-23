import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { isFormulaErrorValue, textArg } from './textFormat/FormulaTextValues';

/** Capitalizes each word and lowercases remaining letters. Example: PROPER("this is A TITLE") returns "This Is A Title". */
export const PROPER: FormulaFunction = {
  name: 'PROPER',
  evaluate(args, context) {
    const text = textArg(args, 0, context);
    if (isFormulaErrorValue(text)) return text;
    return text
      .toLowerCase()
      .replace(
        /(^|[^\p{L}\p{M}])([\p{L}])/gu,
        (_match, prefix: string, letter: string) => prefix + letter.toUpperCase(),
      );
  },
};
