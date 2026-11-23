import {
  createFormulaError,
  FormulaErrorCode,
  type FormulaFunction,
  isFormulaError,
} from '@searsuite/sear-domain-formula-engine';
import { isFormulaText } from '@searsuite/sear-foundation-utils';
import { numberArg, numberOrDateArg, scalar, lookupValueError } from '../lookup/lookupHelpers';

const ordinaryDigits = '零一二三四五六七八九';
const financialDigits = '零壹贰叁肆伍陆柒捌玖';

function positional(value: number, mode: 1 | 2): string {
  if (value === 0) return mode === 1 ? '○' : '零';
  const digits = mode === 1 ? ordinaryDigits : financialDigits;
  const units = mode === 1 ? ['', '十', '百', '千'] : ['', '拾', '佰', '仟'];
  const largeUnits = mode === 1 ? ['', '万', '亿', '兆'] : ['', '萬', '億', '兆'];
  const groups: number[] = [];
  for (let remaining = value; remaining > 0; remaining = Math.floor(remaining / 10_000)) {
    groups.push(remaining % 10_000);
  }
  let result = '';
  let skippedGroup = false;
  for (let groupIndex = groups.length - 1; groupIndex >= 0; groupIndex--) {
    const group = groups[groupIndex]!;
    if (group === 0) {
      skippedGroup = result !== '';
      continue;
    }
    if (result && (skippedGroup || group < 1000)) result += digits[0];
    let groupText = '';
    let pendingZero = false;
    for (let place = 3; place >= 0; place--) {
      const digit = Math.floor(group / 10 ** place) % 10;
      if (digit === 0) {
        pendingZero = groupText !== '';
        continue;
      }
      if (pendingZero) groupText += digits[0];
      groupText += digits[digit] + units[place];
      pendingZero = false;
    }
    result += groupText + largeUnits[groupIndex];
    skippedGroup = false;
  }
  return result;
}

/** Converts a nonnegative number to one of the supported Chinese numeral styles. */
export const NUMBERSTRING: FormulaFunction = {
  name: 'NUMBERSTRING',
  evaluate(args, context) {
    if (args.length < 1 || args.length > 2) return lookupValueError();
    const raw = scalar(args[0], context);
    if (isFormulaError(raw)) return raw;
    const text = isFormulaText(raw) ? raw.value : typeof raw === 'string' ? raw : null;
    if (text === '') return lookupValueError();
    const value = numberOrDateArg(args[0], context);
    if (isFormulaError(value)) return value;
    const modeValue = args[1] && args[1].kind !== 'missing' ? numberArg(args[1], context) : 1;
    if (isFormulaError(modeValue)) return modeValue;
    const mode = Math.trunc(modeValue);
    if (mode < 1 || mode > 3) return createFormulaError(FormulaErrorCode.Number);
    if (value < 0 || value >= 10 ** 16) return createFormulaError(FormulaErrorCode.Number);
    const rounded = Math.round(value);
    if (mode === 3) return String(rounded).replace(/\d/g, (digit) => ordinaryDigits[Number(digit)]!);
    return positional(rounded, mode as 1 | 2);
  },
};
