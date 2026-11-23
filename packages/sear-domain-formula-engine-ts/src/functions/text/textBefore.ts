import { FormulaErrorCode, createFormulaError, type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { integerArg, isFormulaErrorValue, scalarValueArg, textArg, valueError } from './textFormat/FormulaTextValues';
import { findCaseInsensitive, type TextMatch } from './textCaseFold';

/** Returns text before a delimiter occurrence. Example: TEXTBEFORE("red-blue","-") returns "red". */
export const TEXTBEFORE: FormulaFunction = {
  name: 'TEXTBEFORE',
  lazy: true,
  evaluate(args, context) {
    const text = textArg(args, 0, context);
    if (isFormulaErrorValue(text)) return text;
    const delimiter = textArg(args, 1, context);
    if (isFormulaErrorValue(delimiter)) return delimiter;
    const instance = integerArg(args, 2, context, 1);
    if (isFormulaErrorValue(instance)) return instance;
    const matchMode = integerArg(args, 3, context, 0);
    if (isFormulaErrorValue(matchMode)) return matchMode;
    const matchEnd = integerArg(args, 4, context, 0);
    if (isFormulaErrorValue(matchEnd)) return matchEnd;
    const fallback = () => scalarValueArg(args, 5, context);
    if (instance === 0 || ![0, 1].includes(matchMode) || ![0, 1].includes(matchEnd)) return valueError();
    if (delimiter === '' && Math.abs(instance) === 1) return instance > 0 ? '' : text;
    const positions: TextMatch[] = [];
    let from = 0;
    while (delimiter !== '') {
      const found = matchMode
        ? findCaseInsensitive(text, delimiter, from)
        : (() => {
            const start = text.indexOf(delimiter, from);
            return start < 0 ? undefined : { start, end: start + delimiter.length };
          })();
      if (!found) break;
      positions.push(found);
      from = found.end;
    }
    if (matchEnd) positions.push({ start: text.length, end: text.length });
    const selected = instance > 0 ? positions[instance - 1] : positions[positions.length + instance];
    if (selected === undefined) {
      if (args[5] !== undefined && args[5].kind !== 'missing') return fallback();
      return (positions.length > 0 && Math.abs(instance) > text.length + matchEnd) ||
        (Math.abs(instance) > 1 && delimiter.length >= text.length)
        ? valueError()
        : createFormulaError(FormulaErrorCode.NotAvailable);
    }
    return text.slice(0, selected.start);
  },
};
