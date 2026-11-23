import { SearError } from '@searsuite/sear-foundation-error';

export const CellHighlightKind = {
  Value: 'value', Text: 'text', Duplicate: 'duplicate', Unique: 'unique',
  Empty: 'empty', NotEmpty: 'notEmpty', Error: 'error', NotError: 'notError',
  Top: 'top', Bottom: 'bottom', AboveAverage: 'aboveAverage', BelowAverage: 'belowAverage',
} as const;
export type CellHighlightKind = (typeof CellHighlightKind)[keyof typeof CellHighlightKind];

export const CellHighlightValueOperator = {
  Between: 'between', NotBetween: 'notBetween', Equal: 'equal', NotEqual: 'notEqual',
  Greater: 'greater', GreaterOrEqual: 'greaterOrEqual', Less: 'less', LessOrEqual: 'lessOrEqual',
} as const;
export type CellHighlightValueOperator = (typeof CellHighlightValueOperator)[keyof typeof CellHighlightValueOperator];

export const CellHighlightTextOperator = {
  StartsWith: 'startsWith', EndsWith: 'endsWith', Contains: 'contains', NotContains: 'notContains',
} as const;
export type CellHighlightTextOperator = (typeof CellHighlightTextOperator)[keyof typeof CellHighlightTextOperator];

export const CellHighlightStyle = {
  RedFill: 'redFill', YellowFill: 'yellowFill', GreenFill: 'greenFill',
  RedBorder: 'redBorder', RedText: 'redText',
} as const;
export type CellHighlightStyle = (typeof CellHighlightStyle)[keyof typeof CellHighlightStyle];

export interface CellHighlightCondition {
  readonly kind: CellHighlightKind;
  readonly operator?: CellHighlightValueOperator | CellHighlightTextOperator;
  readonly value?: string;
  readonly secondValue?: string;
  readonly count?: number;
  readonly percent?: boolean;
  readonly includeEqual?: boolean;
}

export function isCellHighlightRankKind(kind: CellHighlightKind): boolean {
  return kind === CellHighlightKind.Top || kind === CellHighlightKind.Bottom;
}

export function isCellHighlightRangeStatisticKind(kind: CellHighlightKind): boolean {
  return isCellHighlightRankKind(kind) || kind === CellHighlightKind.AboveAverage || kind === CellHighlightKind.BelowAverage;
}

/** One conditional rule stored at its range's top-left matrix cell. */
export interface CellHighlightRule {
  readonly id: string;
  readonly priority: number;
  readonly endRow: number;
  readonly endColumn: number;
  readonly condition: CellHighlightCondition;
  readonly style: CellHighlightStyle;
}

export function assertCellHighlightRule(rule: CellHighlightRule, row: number, column: number, shape: readonly number[]): void {
  if (!rule || typeof rule !== 'object' || !rule.condition || typeof rule.condition !== 'object') {
    throw new SearError('Cell highlight rule must contain a condition.');
  }
  if (!rule.id || !Number.isSafeInteger(rule.priority) || rule.priority < 0 ||
    !Number.isInteger(rule.endRow) || !Number.isInteger(rule.endColumn) ||
    rule.endRow < row || rule.endColumn < column || rule.endRow >= shape[0] || rule.endColumn >= shape[1]) {
    throw new SearError('Cell highlight rule has an invalid id or range.');
  }
  if (!Object.values(CellHighlightStyle).includes(rule.style)) throw new SearError('Unsupported cell highlight style.');
  const { kind, operator, value, secondValue, count, percent, includeEqual } = rule.condition;
  if (!Object.values(CellHighlightKind).includes(kind)) throw new SearError('Unsupported cell highlight condition.');
  if (isCellHighlightRankKind(kind)) {
    if (!Number.isSafeInteger(count) || (count ?? 0) < 1 ||
      (percent !== undefined && typeof percent !== 'boolean') ||
      (percent && (count ?? 0) > 100) || includeEqual !== undefined) {
      throw new SearError('Rank highlight requires a positive item count or a percentage from 1 to 100.');
    }
  } else if (kind === CellHighlightKind.AboveAverage || kind === CellHighlightKind.BelowAverage) {
    if (count !== undefined || percent !== undefined ||
      (includeEqual !== undefined && typeof includeEqual !== 'boolean')) {
      throw new SearError('Average highlight has invalid options.');
    }
  }
  if (kind === CellHighlightKind.Value) {
    if (!Object.values(CellHighlightValueOperator).includes(operator as CellHighlightValueOperator) ||
      typeof value !== 'string' ||
      ((operator === CellHighlightValueOperator.Between || operator === CellHighlightValueOperator.NotBetween) &&
        typeof secondValue !== 'string')) throw new SearError('Cell value highlight requires a comparison and value.');
  } else if (kind === CellHighlightKind.Text &&
    (!Object.values(CellHighlightTextOperator).includes(operator as CellHighlightTextOperator) || typeof value !== 'string')) {
    throw new SearError('Text highlight requires an operator and text.');
  }
}
