import { type SpreadsheetFormatLocale } from '../types/SpreadsheetFormatTypes';
import { countPlaceholders } from './countPlaceholders';
import { formatDecimalFractionText } from './formatDecimalFractionText';
import { formatIntegerPattern } from './formatIntegerPattern';
import { roundToDecimals } from './roundToDecimals';

export function formatDecimalPattern(value: number, numericPattern: string, locale: SpreadsheetFormatLocale): string {
  const decimalIndex = numericPattern.lastIndexOf('.');
  const integerPattern = decimalIndex >= 0 ? numericPattern.slice(0, decimalIndex) : numericPattern;
  const fractionPattern = decimalIndex >= 0 ? numericPattern.slice(decimalIndex + 1) : '';
  const maxDecimals = countPlaceholders(fractionPattern);
  const minDecimals = (fractionPattern.match(/0/g) ?? []).length;
  const rounded = value >= 1e21 ? value : roundToDecimals(value, maxDecimals);
  const fixed = rounded >= 1e21
    ? new Intl.NumberFormat('en-US', {
      useGrouping: false,
      minimumFractionDigits: maxDecimals,
      maximumFractionDigits: maxDecimals,
    }).format(rounded)
    : rounded.toFixed(maxDecimals);
  const [integerText, fractionText = ''] = fixed.split('.');
  const integer = formatIntegerPattern(integerText, integerPattern, locale);
  const fraction = formatDecimalFractionText(fractionText, fractionPattern, minDecimals, locale);
  return `${integer}${fraction}`;
}
