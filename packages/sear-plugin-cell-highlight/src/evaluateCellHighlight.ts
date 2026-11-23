import { CellHighlightKind, CellHighlightTextOperator, CellHighlightValueOperator, type CellHighlightCondition } from './CellHighlightRule';
import { type Platform } from '@searsuite/sear-foundation-platform';
import { formatFormulaValue } from '@searsuite/sear-render-registry';

export type CellHighlightValueReader = (row: number, column: number) => unknown;
export type CellHighlightValueRangeReader = (
  startRow: number, startColumn: number, endRow: number, endColumn: number,
  visit: (value: unknown) => void,
) => void;

export function cellHighlightText(value: unknown): string {
  return formatFormulaValue(value);
}

export function hasCellHighlightWildcard(pattern: string): boolean {
  return /[?*~]/.test(pattern);
}

function textPatternSource(pattern: string): string {
  let source = '';
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index]!;
    if (char === '~' && /[?*~]/.test(pattern[index + 1] ?? '')) {
      source += pattern[++index]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    } else if (char === '*') source += '.*';
    else if (char === '?') source += '.';
    else source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return source;
}

export function matchesCellHighlightWildcard(
  actual: string, pattern: string, platform: Pick<Platform, 'toLowerCase'>,
): boolean {
  if (!hasCellHighlightWildcard(pattern)) return false;
  return new RegExp(`^${textPatternSource(platform.toLowerCase(pattern))}$`, 'su')
    .test(platform.toLowerCase(actual));
}

function matchesTextPattern(actual: string, pattern: string, operator: CellHighlightTextOperator): boolean {
  if (!hasCellHighlightWildcard(pattern)) {
    switch (operator) {
      case CellHighlightTextOperator.StartsWith: return actual.startsWith(pattern);
      case CellHighlightTextOperator.EndsWith: return actual.endsWith(pattern);
      case CellHighlightTextOperator.Contains: return actual.includes(pattern);
      case CellHighlightTextOperator.NotContains: return !actual.includes(pattern);
    }
  }
  const source = textPatternSource(pattern);
  const expression = new RegExp(
    `${operator === CellHighlightTextOperator.StartsWith ? '^' : ''}${source}${operator === CellHighlightTextOperator.EndsWith ? '$' : ''}`,
    'su',
  );
  const matched = expression.test(actual);
  return operator === CellHighlightTextOperator.NotContains ? !matched : matched;
}

function isErrorValue(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'error';
}

export function evaluateCellHighlight(
  condition: CellHighlightCondition,
  value: unknown,
  platform: Pick<Platform, 'toLowerCase'>,
  occurrences = 0,
  rangeThreshold: number | null = null,
): boolean {
  const text = cellHighlightText(value);
  switch (condition.kind) {
    case CellHighlightKind.Top:
    case CellHighlightKind.Bottom:
    case CellHighlightKind.AboveAverage:
    case CellHighlightKind.BelowAverage: {
      if (typeof value !== 'number' || !Number.isFinite(value) || rangeThreshold === null) return false;
      switch (condition.kind) {
        case CellHighlightKind.Top: return value >= rangeThreshold;
        case CellHighlightKind.Bottom: return value <= rangeThreshold;
        case CellHighlightKind.AboveAverage: return condition.includeEqual ? value >= rangeThreshold : value > rangeThreshold;
        case CellHighlightKind.BelowAverage: return condition.includeEqual ? value <= rangeThreshold : value < rangeThreshold;
      }
    }
    case CellHighlightKind.Empty: return text === '';
    case CellHighlightKind.NotEmpty: return text !== '';
    case CellHighlightKind.Error: return isErrorValue(value);
    case CellHighlightKind.NotError: return !isErrorValue(value);
    case CellHighlightKind.Duplicate: return text !== '' && occurrences > 1;
    case CellHighlightKind.Unique: return text !== '' && occurrences === 1;
    case CellHighlightKind.Text: {
      const actual = platform.toLowerCase(text);
      const target = platform.toLowerCase(condition.value ?? '');
      return Object.values(CellHighlightTextOperator).includes(condition.operator as CellHighlightTextOperator)
        ? matchesTextPattern(actual, target, condition.operator as CellHighlightTextOperator) : false;
    }
    case CellHighlightKind.Value: {
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text.trim())) return false;
      const numeric = Number(text);
      const first = Number(condition.value);
      const second = Number(condition.secondValue);
      if (!Number.isFinite(numeric) || !Number.isFinite(first)) return false;
      switch (condition.operator) {
        case CellHighlightValueOperator.Between: return Number.isFinite(second) && numeric >= Math.min(first, second) && numeric <= Math.max(first, second);
        case CellHighlightValueOperator.NotBetween: return Number.isFinite(second) && (numeric < Math.min(first, second) || numeric > Math.max(first, second));
        case CellHighlightValueOperator.Equal: return numeric === first;
        case CellHighlightValueOperator.NotEqual: return numeric !== first;
        case CellHighlightValueOperator.Greater: return numeric > first;
        case CellHighlightValueOperator.GreaterOrEqual: return numeric >= first;
        case CellHighlightValueOperator.Less: return numeric < first;
        case CellHighlightValueOperator.LessOrEqual: return numeric <= first;
        default: return false;
      }
    }
  }
}

export function countCellHighlightOccurrences(
  startRow: number, startColumn: number, endRow: number, endColumn: number,
  forEachValueInRange: CellHighlightValueRangeReader,
): Map<string, number> {
  const counts = new Map<string, number>();
  forEachValueInRange(startRow, startColumn, endRow, endColumn, (value) => {
    const text = cellHighlightText(value);
    if (text !== '') counts.set(text, (counts.get(text) ?? 0) + 1);
  });
  return counts;
}
