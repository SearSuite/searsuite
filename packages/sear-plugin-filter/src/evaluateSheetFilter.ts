import { type Platform } from '@searsuite/sear-foundation-platform';
import {
  SheetFilterCategory, SheetFilterKind, SheetFilterOperator, sheetFilterValueKey,
  type SheetFilterPredicate,
} from './SheetFilterTypes';
import { parseSheetFilterNumber } from './parseSheetFilterNumber';

export function evaluateSheetFilter(
  predicate: SheetFilterPredicate,
  value: unknown,
  readColor: (property: 'fill' | 'textColor') => string | null,
  platform: Pick<Platform, 'toLowerCase'>,
  parseDate: (value: unknown) => number | null = (input) => typeof input === 'number' ? input : Date.parse(String(input)),
): boolean {
  if (predicate.kind === SheetFilterKind.Values) {
    const key = platform.toLowerCase(sheetFilterValueKey(value));
    const listed = predicate.values.some((entry) => platform.toLowerCase(entry) === key);
    return predicate.excluded ? !listed : listed;
  }
  if (predicate.kind === SheetFilterKind.Color) {
    const color = readColor(predicate.property);
    return predicate.color === null ? color === null : color !== null &&
      platform.toLowerCase(color) === platform.toLowerCase(predicate.color);
  }
  const text = sheetFilterValueKey(value);
  if (predicate.category === SheetFilterCategory.Text) {
    const left = platform.toLowerCase(text);
    const right = platform.toLowerCase(predicate.value);
    switch (predicate.operator) {
      case SheetFilterOperator.Equal: return matchesTextPattern(left, right);
      case SheetFilterOperator.NotEqual: return !matchesTextPattern(left, right);
      case SheetFilterOperator.StartsWith: return left.startsWith(right);
      case SheetFilterOperator.NotStartsWith: return !left.startsWith(right);
      case SheetFilterOperator.EndsWith: return left.endsWith(right);
      case SheetFilterOperator.NotEndsWith: return !left.endsWith(right);
      case SheetFilterOperator.Contains: return left.includes(right);
      case SheetFilterOperator.NotContains: return !left.includes(right);
      default: return false;
    }
  }
  if (text === '') return false;
  const left = predicate.category === SheetFilterCategory.Date ? parseDate(value) : parseSheetFilterNumber(value);
  const right = predicate.category === SheetFilterCategory.Date ? parseDate(predicate.value)
    : parseSheetFilterNumber(predicate.value);
  const second = predicate.secondValue === undefined ? null
    : predicate.category === SheetFilterCategory.Date ? parseDate(predicate.secondValue)
      : parseSheetFilterNumber(predicate.secondValue);
  if (left === null || right === null || !Number.isFinite(left) || !Number.isFinite(right)) return false;
  switch (predicate.operator) {
    case SheetFilterOperator.Equal: return left === right;
    case SheetFilterOperator.NotEqual: return left !== right;
    case SheetFilterOperator.Greater: return left > right;
    case SheetFilterOperator.GreaterEqual: return left >= right;
    case SheetFilterOperator.Less: return left < right;
    case SheetFilterOperator.LessEqual: return left <= right;
    case SheetFilterOperator.Between: return second !== null && Number.isFinite(second) && left >= right && left <= second;
    case SheetFilterOperator.NotBetween: return second !== null && Number.isFinite(second) && (left < right || left > second);
    default: return false;
  }
}

function matchesTextPattern(value: string, pattern: string): boolean {
  const chars = Array.from(value);
  const tokens: { char: string; wildcard: boolean }[] = [];
  const patternChars = Array.from(pattern);
  for (let index = 0; index < patternChars.length; index += 1) {
    const char = patternChars[index]!;
    if (char === '~' && index + 1 < patternChars.length && ['?', '*', '~'].includes(patternChars[index + 1]!)) {
      tokens.push({ char: patternChars[++index]!, wildcard: false });
    } else {
      tokens.push({ char, wildcard: char === '?' || char === '*' });
    }
  }

  let valueIndex = 0;
  let tokenIndex = 0;
  let starIndex = -1;
  let afterStar = 0;
  while (valueIndex < chars.length) {
    const token = tokens[tokenIndex];
    if (token?.wildcard && token.char === '*') {
      starIndex = tokenIndex++;
      afterStar = valueIndex;
    } else if (token && (token.char === chars[valueIndex] || (token.wildcard && token.char === '?'))) {
      valueIndex += 1;
      tokenIndex += 1;
    } else if (starIndex >= 0) {
      tokenIndex = starIndex + 1;
      valueIndex = ++afterStar;
    } else return false;
  }
  return tokens.slice(tokenIndex).every((token) => token.wildcard && token.char === '*');
}
