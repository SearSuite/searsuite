import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { isFormulaText } from '@searsuite/sear-foundation-utils';
import { dateTimeParseOptions } from '../dateTime/shared/dateTimeFunctionUtils';
import { parseExcelDate } from '../dateTime/shared/dateTimeUtils';
import { coerceNumber, isFormulaErrorValue, scalarValueArg, valueError } from './textFormat/FormulaTextValues';

const THAI_DIGITS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'] as const;
const THAI_PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'] as const;

function thaiBelowMillion(value: number, hasHigherGroup = false): string {
  if (value === 0) return '';
  let result = '';
  for (let place = 5; place >= 0; place--) {
    const divisor = 10 ** place;
    const digit = Math.floor(value / divisor) % 10;
    if (digit === 0) continue;
    if (place === 1 && digit === 1) result += THAI_PLACES[place];
    else if (place === 1 && digit === 2) result += `ยี่${THAI_PLACES[place]}`;
    else if (place === 0 && digit === 1 && (value > 10 || hasHigherGroup)) result += 'เอ็ด';
    else result += `${THAI_DIGITS[digit]}${THAI_PLACES[place]}`;
  }
  return result;
}

function thaiInteger(value: number): string {
  if (value === 0) return THAI_DIGITS[0];
  if (value < 1_000_000) return thaiBelowMillion(value);
  const millions = Math.floor(value / 1_000_000);
  const remainder = value % 1_000_000;
  return `${thaiInteger(millions)}ล้าน${thaiBelowMillion(remainder, true)}`;
}

/** Converts a finite number to Excel-style Thai baht and satang text. */
export function formatBahtText(value: number): string | undefined {
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) return undefined;
  const negative = value < 0;
  const absolute = Math.abs(value);
  const roundedSatang = Math.round(((absolute % 1) + Number.EPSILON) * 100);
  const baht = Math.floor(absolute) + Math.floor(roundedSatang / 100);
  const satang = roundedSatang % 100;
  const prefix = negative ? 'ลบ' : '';
  const bahtText = baht === 0
    ? negative ? 'บาท' : satang !== 0 ? '' : `${thaiInteger(0)}บาท`
    : `${thaiInteger(baht)}บาท`;
  return satang === 0 ? `${prefix}${bahtText}ถ้วน` : `${prefix}${bahtText}${thaiInteger(satang)}สตางค์`;
}

/** Spells a number as Thai baht and satang. Example: BAHTTEXT(1234) returns Thai amount text. */
export const BAHTTEXT: FormulaFunction = {
  name: 'BAHTTEXT',
  evaluate(args, context) {
    if (args.length !== 1) return valueError();
    const raw = scalarValueArg(args, 0, context);
    if (isFormulaErrorValue(raw)) return raw;
    const text = isFormulaText(raw) ? raw.value : typeof raw === 'string' ? raw : null;
    if (text !== null && text.trim() === '') return valueError();
    const numeric = coerceNumber(raw);
    const value =
      isFormulaErrorValue(numeric) && text !== null
        ? parseExcelDate(text, dateTimeParseOptions(context)) ?? numeric
        : numeric;
    if (isFormulaErrorValue(value)) return value;
    return formatBahtText(value) ?? valueError();
  },
};
