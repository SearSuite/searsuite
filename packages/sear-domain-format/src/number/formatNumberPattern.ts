import { cleanFormatLiterals } from '../literals/cleanFormatLiterals';
import { type SpreadsheetFormatLocale } from '../types/SpreadsheetFormatTypes';
import { findFirstNumericPlaceholder } from './findFirstNumericPlaceholder';
import { findLastNumericPlaceholder } from './findLastNumericPlaceholder';
import { formatDecimalPattern } from './formatDecimalPattern';
import { formatFractionPattern } from './formatFractionPattern';
import { formatScientificPattern } from './formatScientificPattern';
import { removeTrailingScalingCommas } from './removeTrailingScalingCommas';
import { countPlaceholders } from './countPlaceholders';
import { roundToDecimals } from './roundToDecimals';
import { trailingScalingCommaCount } from './trailingScalingCommaCount';

export function formatNumberPattern(
  value: number,
  pattern: string,
  selectedNonFirstSection: boolean,
  locale: SpreadsheetFormatLocale,
): string | null {
  const percentCount = countPercentDirectives(pattern);
  const scale = Math.pow(100, percentCount) / Math.pow(1000, trailingScalingCommaCount(pattern));
  const scaled = value * scale;
  if (!Number.isFinite(scaled)) return null;
  const absolute = Math.abs(scaled);
  const patternWithoutScaling = removeTrailingScalingCommas(pattern);
  const firstPlaceholder = findFirstNumericPlaceholder(patternWithoutScaling);
  if (firstPlaceholder < 0) {
    const numericLiteral = /^(-?[1-9]+)(\.[1-9]+)$/.exec(patternWithoutScaling);
    return numericLiteral
      ? `${numericLiteral[1]}${formatDecimalPattern(absolute, '0', locale)}${numericLiteral[2]}`
      : cleanFormatLiterals(patternWithoutScaling);
  }
  const lastPlaceholder = findNumericPatternEnd(patternWithoutScaling);
  const numericStart = patternWithoutScaling[firstPlaceholder - 1] === '.' ? firstPlaceholder - 1 : firstPlaceholder;
  const prefix = cleanFormatLiterals(patternWithoutScaling.slice(0, numericStart));
  const suffix = cleanFormatLiterals(patternWithoutScaling.slice(lastPlaceholder + 1));
  const numericPattern = patternWithoutScaling.slice(numericStart, lastPlaceholder + 1);
  const plainDecimal = !numericPattern.includes('/') && !/E[+-]?/i.test(numericPattern);
  const decimalIndex = numericPattern.lastIndexOf('.');
  const fractionalPattern = decimalIndex < 0 ? '' : numericPattern.slice(decimalIndex + 1);
  const decimals = countPlaceholders(fractionalPattern.split(/E[+-]?/i)[0] ?? '');
  if (decimals > 100) return null;
  const negative =
    scaled < 0 && !selectedNonFirstSection && (!plainDecimal || roundToDecimals(absolute, decimals) !== 0);
  const body = numericPattern.includes('/')
    ? formatFractionPattern(absolute, numericPattern)
    : /E[+-]?/i.test(numericPattern)
    ? formatScientificPattern(absolute, numericPattern, locale)
    : formatDecimalPattern(absolute, numericPattern, locale);
  return `${negative ? '-' : ''}${prefix}${body}${suffix}`;
}

function findNumericPatternEnd(pattern: string): number {
  const placeholderEnd = findLastNumericPlaceholder(pattern);
  const slash = pattern.indexOf('/');
  if (slash < 0 || slash < findFirstNumericPlaceholder(pattern)) return placeholderEnd;
  const denominator = /^(?:[0#?]+|\d+)/.exec(pattern.slice(slash + 1));
  return denominator ? slash + denominator[0].length : placeholderEnd;
}

function countPercentDirectives(pattern: string): number {
  let percentCount = 0;
  let inQuote = false;
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]!;
    if (character === '\\') {
      index += 1;
      continue;
    }
    if (character === '"') inQuote = !inQuote;
    if (character === '%' && !inQuote) percentCount += 1;
  }
  return percentCount;
}
