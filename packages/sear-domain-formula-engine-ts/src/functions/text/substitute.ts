import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { integerArg, isFormulaErrorValue, textArg, valueError } from './textFormat/FormulaTextValues';

/** Replaces matching text, optionally only one occurrence. Example: SUBSTITUTE("a-b","-","/") returns "a/b". */
export const SUBSTITUTE: FormulaFunction = {
  name: 'SUBSTITUTE',
  evaluate(args, context) {
    const text = textArg(args, 0, context);
    if (isFormulaErrorValue(text)) return text;
    const oldText = textArg(args, 1, context);
    if (isFormulaErrorValue(oldText)) return oldText;
    const newText = textArg(args, 2, context);
    if (isFormulaErrorValue(newText)) return newText;
    if (oldText === '' && (args[3] === undefined || args[3].kind === 'missing')) return text;
    if (args[3] === undefined || args[3].kind === 'missing') return text.split(oldText).join(newText);
    const occurrence = integerArg(args, 3, context, 0);
    if (isFormulaErrorValue(occurrence)) return occurrence;
    if (occurrence < 1 || oldText === '') return valueError();
    let from = 0;
    let index = -1;
    for (let count = 0; count < occurrence; count++) {
      index = text.indexOf(oldText, from);
      if (index < 0) return text;
      from = index + oldText.length;
    }
    return text.slice(0, index) + newText + text.slice(index + oldText.length);
  },
};
