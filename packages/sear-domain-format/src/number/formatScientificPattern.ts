import { type SpreadsheetFormatLocale } from '../types/SpreadsheetFormatTypes';
import { countPlaceholders } from './countPlaceholders';
import { formatDecimalPattern } from './formatDecimalPattern';
import { roundToDecimals } from './roundToDecimals';

export function formatScientificPattern(
  value: number,
  numericPattern: string,
  locale: SpreadsheetFormatLocale,
): string {
  const match = /^(.*?)(E[+-]?)(0+)$/i.exec(numericPattern);
  if (!match) return formatDecimalPattern(value, numericPattern, locale);
  const mantissaPattern = match[1]!;
  const exponentMarker = match[2]!;
  const exponentDigits = match[3]!.length;
  if (value === 0) {
    const mantissa = formatDecimalPattern(0, mantissaPattern, locale);
    const sign = exponentMarker.includes('+') ? '+' : '';
    return `${mantissa}${exponentMarker[0] === 'e' ? 'e' : 'E'}${sign}${'0'.repeat(exponentDigits)}`;
  }
  const integerPlaceholders = (mantissaPattern.split('.')[0]?.match(/[0#?]/g) ?? []).length;
  const exponentStep = Math.max(1, integerPlaceholders);
  let exponent = Math.floor(Math.log10(value) / exponentStep) * exponentStep;
  let mantissa = scaleMantissa(value, exponent);
  const decimalIndex = mantissaPattern.indexOf('.');
  const decimalPlaces = decimalIndex < 0 ? 0 : countPlaceholders(mantissaPattern.slice(decimalIndex + 1));
  if (roundToDecimals(mantissa, decimalPlaces) >= Math.pow(10, exponentStep)) {
    exponent += exponentStep;
    mantissa = scaleMantissa(value, exponent);
  }
  const mantissaText = formatDecimalPattern(mantissa, mantissaPattern, locale);
  const sign = exponent < 0 ? '-' : exponentMarker.includes('+') ? '+' : '';
  return `${mantissaText}${exponentMarker[0] === 'e' ? 'e' : 'E'}${sign}${String(Math.abs(exponent)).padStart(
    exponentDigits,
    '0',
  )}`;
}

function scaleMantissa(value: number, exponent: number): number {
  const firstExponent = Math.max(exponent, -308);
  return value / Math.pow(10, firstExponent) / Math.pow(10, exponent - firstExponent);
}
