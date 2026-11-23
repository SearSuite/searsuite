import { resolveDropdownSelection } from './DropdownSelection';
import { identityCountyCodes } from './identityCountyCodes';
import { parseDataValidationDate } from './parseDataValidationDate';
import {
  DataValidationDropdownMode, DataValidationKind, DataValidationOperator, DataValidationTextMode,
  type DataValidationCondition,
} from './DataValidationRule';

export interface DataValidationEvaluationContext {
  readonly row: number;
  readonly column: number;
  readonly currentDateTime?: number;
  readonly readSourceValues?: (start: readonly [number, number], end: readonly [number, number]) => readonly string[];
  /** Host contribution for formula results and structured cell types. Null means unavailable. */
  readonly evaluateExternal?: (condition: DataValidationCondition, text: string, row: number, column: number) => boolean | null;
}

/** Returns null when a host-owned value type has no evaluator. Empty input is allowed. */
export function evaluateDataValidation(
  condition: DataValidationCondition,
  text: string,
  context: DataValidationEvaluationContext,
): boolean | null {
  if (text === '') return true;
  const contributed = context.evaluateExternal?.(condition, text, context.row, context.column);
  if (contributed !== undefined && contributed !== null) return contributed;
  switch (condition.kind) {
    case DataValidationKind.Dropdown: {
      const options = condition.sourceRange
        ? context.readSourceValues?.(condition.sourceRange.start, condition.sourceRange.end)
        : condition.options?.map((option) => option.label);
      if (!options) return null;
      const values = condition.dropdownMode === DataValidationDropdownMode.Multiple
        ? resolveDropdownSelection(text, options) : [text];
      return new Set(values).size === values.length && values.every((value) => options.includes(value));
    }
    case DataValidationKind.Number: {
      const numeric = parseFiniteDecimal(text);
      if (numeric === null || (condition.integerOnly && !Number.isInteger(numeric))) return false;
      return compare(numeric, condition, Number);
    }
    case DataValidationKind.Date: {
      const date = parseDataValidationDate(text) ?? parseStoredDateSerial(text);
      return date === null ? false : compare(date, condition, parseDataValidationDate);
    }
    case DataValidationKind.Text:
      if (condition.textMode === DataValidationTextMode.Length) return compare(text.length, condition, Number);
      return compareText(text, condition);
    case DataValidationKind.Checkbox: return text === 'TRUE' || text === 'FALSE' || text === 'true' || text === 'false';
    case DataValidationKind.Progress: {
      const numeric = parseFiniteDecimal(text);
      return numeric !== null && numeric >= 0 && numeric <= 100;
    }
    case DataValidationKind.Rating: {
      const numeric = parseFiniteDecimal(text);
      return numeric !== null && Number.isInteger(numeric) && numeric >= 0 && numeric <= 5;
    }
    case DataValidationKind.Link: return isValidLink(text);
    case DataValidationKind.Phone: return /^1[3-9]\d{9}$/.test(text);
    case DataValidationKind.IdentityCard: return isChineseIdentityCard(text, context.currentDateTime ?? Date.now());
    default: return null;
  }
}

function parseFiniteDecimal(value: string): number | null {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseStoredDateSerial(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const serial = Number(value);
  if (!Number.isSafeInteger(serial) || serial < 1 || serial === 60) return null;
  const day = serial > 60 ? serial - 1 : serial;
  const timestamp = Date.UTC(1899, 11, 31) + day * 86_400_000;
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isValidLink(value: string): boolean {
  if (/^mailto:/i.test(value)) {
    try {
      const url = new URL(value);
      const recipients = url.pathname.split(',');
      return recipients.length > 0 && recipients.every((recipient) => isValidMailRecipient(decodeURIComponent(recipient)));
    } catch {
      return false;
    }
  }
  if (/\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !!url.hostname;
  } catch {
    return false;
  }
}

function isValidMailRecipient(address: string): boolean {
  if (address.length > 254) return false;
  const parts = address.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')
    || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return false;
  const labels = domain?.split('.') ?? [];
  return labels.length >= 2 && labels.every((label) => label.length <= 63
    && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label));
}

function compare<T>(actual: number, condition: DataValidationCondition, parse: (value: string) => T | null): boolean {
  if (!condition.operator) return true;
  const first = condition.value === undefined ? null : parse(condition.value);
  const second = condition.secondValue === undefined ? null : parse(condition.secondValue);
  if (typeof first !== 'number' || !Number.isFinite(first)) return false;
  const operator = condition.operator;
  switch (operator) {
    case DataValidationOperator.Equal: return actual === first;
    case DataValidationOperator.NotEqual: return actual !== first;
    case DataValidationOperator.Greater: return actual > first;
    case DataValidationOperator.GreaterOrEqual: return actual >= first;
    case DataValidationOperator.Less: return actual < first;
    case DataValidationOperator.LessOrEqual: return actual <= first;
    case DataValidationOperator.Between: return typeof second === 'number' && actual >= first && actual <= second;
    case DataValidationOperator.NotBetween: return typeof second === 'number' && (actual < first || actual > second);
    default: return false;
  }
}

function compareText(text: string, condition: DataValidationCondition): boolean {
  if (!condition.operator) return true;
  const value = condition.value ?? '';
  switch (condition.operator) {
    case DataValidationOperator.StartsWith: return text.startsWith(value);
    case DataValidationOperator.EndsWith: return text.endsWith(value);
    case DataValidationOperator.Contains: return text.includes(value);
    case DataValidationOperator.NotContains: return !text.includes(value);
    case DataValidationOperator.Equal: return text === value;
    case DataValidationOperator.NotEqual: return text !== value;
    default: return false;
  }
}

function isChineseIdentityCard(value: string, currentDateTime: number): boolean {
  if (!/^\d{17}[\dXx]$/.test(value)) return false;
  if (!identityCountyCodes.has(value.slice(0, 6))) return false;
  if (value.slice(14, 17) === '000') return false;
  const birth = parseDataValidationDate(`${value.slice(6, 10)}-${value.slice(10, 12)}-${value.slice(12, 14)}`);
  if (birth === null || birth > currentDateTime) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checks = '10X98765432';
  const sum = weights.reduce((total, weight, index) => total + Number(value[index]) * weight, 0);
  return checks[sum % 11] === value[17]?.toUpperCase();
}
