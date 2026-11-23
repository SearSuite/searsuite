import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { byteTextLocale } from './byteTextSupport';
import { integerArg, isFormulaErrorValue, textArg, valueError } from './textFormat/FormulaTextValues';
import { excelWildcardSearch } from './textFunctionHelpers';

/** Finds case-insensitive text using locale-defined DBCS byte positions. Example: SEARCHB("B", "abc") returns 2. */
export const SEARCHB: FormulaFunction = {
  name: 'SEARCHB',
  evaluate(args, context) {
    const needle = textArg(args, 0, context);
    if (isFormulaErrorValue(needle)) return needle;
    const text = textArg(args, 1, context);
    if (isFormulaErrorValue(text)) return text;
    const start = integerArg(args, 2, context, 1);
    if (isFormulaErrorValue(start)) return start;
    const locale = byteTextLocale(context);
    if (start < 1 || start > locale.byteLength(text) + 1) return valueError();
    if (needle === '') return locale.findByBytes(text, needle, start, false) || valueError();
    let byteOffset = 1;
    let from = text.length;
    for (let offset = 0; offset < text.length; ) {
      const character = String.fromCodePoint(text.codePointAt(offset)!);
      if (byteOffset >= start) {
        from = offset;
        break;
      }
      byteOffset += locale.byteLength(character);
      offset += character.length;
    }
    const position = excelWildcardSearch(needle, text, from);
    return position === undefined ? valueError() : locale.byteLength(text.slice(0, position)) + 1;
  },
};
