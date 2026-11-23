import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { isFormulaErrorValue, textArg, valueError } from './textFormat/FormulaTextValues';
import { byteTextLocale } from './byteTextSupport';
import { macRomanCode } from './macRomanCodePage';

/** Returns the code of the first character. Example: CODE("A") returns 65. */
export const CODE: FormulaFunction = {
  name: 'CODE',
  evaluate(args, context) {
    const text = textArg(args, 0, context);
    if (isFormulaErrorValue(text)) return text;
    if (text.length === 0) return valueError();
    const first = String.fromCodePoint(text.codePointAt(0)!);
    if (first.charCodeAt(0) < 128) return first.charCodeAt(0);
    const pageCode = macRomanCode(first);
    if (pageCode !== undefined) return pageCode;
    const codePoint = first.codePointAt(0)!;
    if (codePoint > 0xffff) return 0;
    if (codePoint >= 0x800) {
      return ((0xe0 | (codePoint >> 12)) << 16)
        | ((0x80 | ((codePoint >> 6) & 0x3f)) << 8)
        | (0x80 | (codePoint & 0x3f));
    }
    const code = byteTextLocale(context).characterCode?.(first);
    return code !== undefined && Number.isInteger(code) && code > 0 && code <= 0xffff ? code : 95;
  },
};
