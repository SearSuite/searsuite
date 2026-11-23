import { SearError } from '@searsuite/sear-foundation-error';
import { parseDataValidationDate } from './parseDataValidationDate';

/** Supported validation value families. */
export const DataValidationKind = {
  Dropdown: 'dropdown', Number: 'number', Date: 'date', Text: 'text', Person: 'person',
  Checkbox: 'checkbox', Progress: 'progress', Rating: 'rating', Document: 'document',
  Link: 'link', Image: 'image', Attachment: 'attachment', IdentityCard: 'identityCard',
  Phone: 'phone', Formula: 'formula',
} as const;
/** One supported validation value family. */
export type DataValidationKind = (typeof DataValidationKind)[keyof typeof DataValidationKind];

/** Comparison operators shared by numeric, date, and text validation. */
export const DataValidationOperator = {
  Equal: 'equal', NotEqual: 'notEqual', Greater: 'greater', GreaterOrEqual: 'greaterOrEqual',
  Less: 'less', LessOrEqual: 'lessOrEqual', Between: 'between', NotBetween: 'notBetween',
  StartsWith: 'startsWith', EndsWith: 'endsWith', Contains: 'contains', NotContains: 'notContains',
} as const;
/** One comparison operator for a validation condition. */
export type DataValidationOperator = (typeof DataValidationOperator)[keyof typeof DataValidationOperator];

/** Whether text validation compares content or character count. */
export const DataValidationTextMode = { Content: 'content', Length: 'length' } as const;
/** Text comparison mode stored with a rule. */
export type DataValidationTextMode = (typeof DataValidationTextMode)[keyof typeof DataValidationTextMode];
/** Action to take when an entered value does not satisfy a rule. */
export const DataValidationInputPolicy = { Reject: 'reject', Warn: 'warn' } as const;
/** Invalid input policy stored with a rule. */
export type DataValidationInputPolicy = (typeof DataValidationInputPolicy)[keyof typeof DataValidationInputPolicy];
/** Selection modes for dropdown validation. */
export const DataValidationDropdownMode = { Single: 'single', Multiple: 'multiple' } as const;
/** Dropdown selection mode stored with a rule. */
export type DataValidationDropdownMode = (typeof DataValidationDropdownMode)[keyof typeof DataValidationDropdownMode];

/** One displayable dropdown choice and its optional color. */
export interface DataValidationOption { readonly label: string; readonly color?: string }
/** Type-specific settings used to evaluate a cell value. */
export interface DataValidationCondition {
  readonly kind: DataValidationKind;
  readonly operator?: DataValidationOperator;
  readonly value?: string;
  readonly secondValue?: string;
  readonly integerOnly?: boolean;
  readonly textMode?: DataValidationTextMode;
  readonly dropdownMode?: DataValidationDropdownMode;
  readonly options?: readonly DataValidationOption[];
  readonly sourceRange?: { readonly start: readonly [number, number]; readonly end: readonly [number, number] };
  readonly showDropdownArrow?: boolean;
  readonly formula?: string;
}

/** One independently editable rule stored at the top-left cell of its range. */
export interface DataValidationRule {
  readonly id: string;
  readonly endRow: number;
  readonly endColumn: number;
  readonly condition: DataValidationCondition;
  readonly inputPolicy: DataValidationInputPolicy;
  readonly errorMessage?: string;
  readonly inputMessage?: string;
}

/** Whether an integer can satisfy a numeric comparison. Bounds must already be finite. */
export function hasIntegerSolution(operator: DataValidationOperator, first: number, second?: number): boolean {
  if (operator === DataValidationOperator.Equal) return Number.isInteger(first);
  if (operator === DataValidationOperator.Between) return second !== undefined && Math.ceil(first) <= Math.floor(second);
  return true;
}

/** Rejects a malformed rule or a range outside the owning sheet. */
export function assertDataValidationRule(rule: DataValidationRule, row: number, column: number, shape: readonly number[]): void {
  if (!rule?.id || !rule.condition || !Number.isInteger(rule.endRow) || !Number.isInteger(rule.endColumn) ||
    rule.endRow < row || rule.endColumn < column || rule.endRow >= shape[0] || rule.endColumn >= shape[1]) {
    throw new SearError('Data validation rule has an invalid id or range.', { row, column });
  }
  const condition = rule.condition;
  if (!Object.values(DataValidationKind).includes(condition.kind)) throw new SearError('Unsupported data validation kind.');
  if (!Object.values(DataValidationInputPolicy).includes(rule.inputPolicy)) throw new SearError('Unsupported input policy.');
  if (rule.errorMessage !== undefined && typeof rule.errorMessage !== 'string') throw new SearError('Invalid warning message.');
  if (rule.inputMessage !== undefined && typeof rule.inputMessage !== 'string') throw new SearError('Invalid input message.');
  if (condition.kind === DataValidationKind.Dropdown &&
    (!condition.options?.length && !condition.sourceRange)) throw new SearError('Dropdown validation needs options or a source range.');
  if (condition.kind === DataValidationKind.Dropdown) {
    if (condition.dropdownMode !== undefined && !Object.values(DataValidationDropdownMode).includes(condition.dropdownMode))
      throw new SearError('Unsupported dropdown selection mode.');
    if (condition.options?.some((option) => !option.label || typeof option.label !== 'string' ||
      (option.color !== undefined && typeof option.color !== 'string'))) throw new SearError('Invalid dropdown option.');
    const labels = condition.options?.map((option) => option.label.trim());
    if (labels && new Set(labels).size !== labels.length)
      throw new SearError('Dropdown options must have distinct labels.');
  }
  if (condition.kind === DataValidationKind.Formula && !condition.formula) throw new SearError('Formula validation needs a formula.');
  if ((condition.kind === DataValidationKind.Number || condition.kind === DataValidationKind.Date ||
    condition.kind === DataValidationKind.Text) && condition.operator &&
    !Object.values(DataValidationOperator).includes(condition.operator)) throw new SearError('Unsupported validation operator.');
  if (condition.operator &&
    (condition.value === undefined ||
      ((condition.operator === DataValidationOperator.Between || condition.operator === DataValidationOperator.NotBetween) &&
        condition.secondValue === undefined))) throw new SearError('Validation comparison needs a value.');
  if (condition.kind === DataValidationKind.Number && condition.operator) {
    const first = Number(condition.value);
    if (!condition.value?.trim() || !Number.isFinite(first))
      throw new SearError('Number comparison needs a finite numeric value.');
    if (condition.operator === DataValidationOperator.Between || condition.operator === DataValidationOperator.NotBetween) {
      const second = Number(condition.secondValue);
      if (!condition.secondValue?.trim() || !Number.isFinite(second))
        throw new SearError('Number comparison needs a finite second value.');
      if (first > second) throw new SearError('Validation range lower bound exceeds upper bound.');
      if (condition.integerOnly && !hasIntegerSolution(condition.operator, first, second))
        throw new SearError('Integer-only comparison has no valid integer.');
    }
    if (condition.integerOnly && condition.operator !== DataValidationOperator.Between &&
      !hasIntegerSolution(condition.operator, first))
      throw new SearError('Integer-only comparison has no valid integer.');
  }
  if (condition.kind === DataValidationKind.Date && condition.operator) {
    const first = condition.value === undefined ? null : parseDataValidationDate(condition.value);
    if (first === null) throw new SearError('Date comparison needs a real calendar date.');
    if (condition.operator === DataValidationOperator.Between || condition.operator === DataValidationOperator.NotBetween) {
      const second = condition.secondValue === undefined ? null : parseDataValidationDate(condition.secondValue);
      if (second === null) throw new SearError('Date comparison needs a real second date.');
      if (first > second) throw new SearError('Validation range lower bound exceeds upper bound.');
    }
  }
  if (condition.kind === DataValidationKind.Text && condition.textMode === DataValidationTextMode.Length && condition.operator) {
    const validLength = (value: string | undefined) =>
      value !== undefined && /^\d+$/.test(value.trim()) && Number.isSafeInteger(Number(value));
    if (!validLength(condition.value) ||
      ((condition.operator === DataValidationOperator.Between || condition.operator === DataValidationOperator.NotBetween) &&
        !validLength(condition.secondValue))) {
      throw new SearError('Text length comparison needs a non-negative integer.');
    }
  }
  if (condition.integerOnly !== undefined && typeof condition.integerOnly !== 'boolean') throw new SearError('Invalid integer-only option.');
  if (condition.showDropdownArrow !== undefined && typeof condition.showDropdownArrow !== 'boolean')
    throw new SearError('Invalid dropdown-arrow option.');
  if (condition.sourceRange) {
    const { start, end } = condition.sourceRange;
    if (![...start, ...end].every(Number.isInteger) || start[0] < 0 || start[1] < 0 ||
      end[0] < start[0] || end[1] < start[1] || end[0] >= shape[0] || end[1] >= shape[1]) {
      throw new SearError('Dropdown source range is outside sheet bounds.');
    }
  }
}
