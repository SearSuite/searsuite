import { type SpreadsheetFormatLocale } from '../types/SpreadsheetFormatTypes';

export function formatDecimalFractionText(
  fractionText: string,
  pattern: string,
  minDecimals: number,
  locale: SpreadsheetFormatLocale,
): string {
  if (!pattern) return '';
  let result = '';
  let significantEnd = minDecimals;
  for (let i = fractionText.length - 1; i >= minDecimals; i--) {
    if (fractionText[i] !== '0') {
      significantEnd = i + 1;
      break;
    }
  }
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === '0') result += fractionText[i] ?? '0';
    else if (ch === '#') {
      if (i < significantEnd) result += fractionText[i] ?? '';
    } else if (ch === '?') result += i < significantEnd ? fractionText[i] ?? ' ' : ' ';
    else result += ch;
  }
  return result ? `${locale.decimalSeparator ?? '.'}${result}` : '';
}
