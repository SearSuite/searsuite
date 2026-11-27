import {
  isFormulaArgumentKind,
  FormulaErrorCode,
  createFormulaError,
  isFormulaError,
  type EvalContext,
  type FormulaArg,
  type FormulaError,
  type FormulaValue,
  type ResolvedFormulaRange,
} from '@searsuite/sear-domain-formula-engine';
import { isFormulaText } from '@searsuite/sear-foundation-utils';
import { excelWildcardRegex } from '../text/textFunctionHelpers';
import {
  readArg,
  resolveFormulaRange,
  readFormulaRangeCell,
  formulaRangeHeight,
  formulaRangeWidth,
} from '../shared/helpers';
import { parseExcelDate } from '../dateTime/shared/dateTimeUtils';
import { dateTimeParseOptions } from '../dateTime/shared/dateTimeFunctionUtils';

export const lookupValueError = () => createFormulaError(FormulaErrorCode.Value);
export const lookupRefError = () => createFormulaError(FormulaErrorCode.Reference);
export const lookupNAError = () => createFormulaError(FormulaErrorCode.NotAvailable);

export function scalar(arg: FormulaArg | undefined, context: EvalContext): FormulaValue | FormulaError {
  if (!arg) return lookupValueError();
  const value = readArg(arg, context);
  return Array.isArray(value) || (typeof value === 'object' && value !== null && 'reference' in value)
    ? lookupValueError()
    : value;
}

export function mapLookupTargets(
  arg: FormulaArg | undefined,
  context: EvalContext,
  lookup: (target: FormulaValue) => FormulaValue,
): FormulaValue {
  if (!arg) return lookupValueError();
  const value = readArg(arg, context);
  const map = (target: FormulaValue): FormulaValue => {
    if (Array.isArray(target)) return target.map(map);
    if (isFormulaError(target)) return target;
    if (typeof target === 'object' && target !== null && 'reference' in target) return lookupValueError();
    return lookup(target);
  };
  return map(value);
}

export function numberArg(arg: FormulaArg | undefined, context: EvalContext): number | FormulaError {
  return numericArg(arg, context, false);
}

export function numberOrDateArg(arg: FormulaArg | undefined, context: EvalContext): number | FormulaError {
  return numericArg(arg, context, true);
}

function numericArg(arg: FormulaArg | undefined, context: EvalContext, acceptDateText: boolean): number | FormulaError {
  const value = scalar(arg, context);
  if (isFormulaError(value)) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const text =
    typeof value === 'string'
      ? value
      : value && typeof value === 'object' && 'value' in value
      ? value.value
      : undefined;
  if (typeof text !== 'string' && typeof text !== 'number') return lookupValueError();
  const result = Number(text);
  if (Number.isFinite(result)) return result;
  return acceptDateText
    ? parseExcelDate(value, dateTimeParseOptions(context)) ?? lookupValueError()
    : lookupValueError();
}

export function booleanArg(
  arg: FormulaArg | undefined,
  context: EvalContext,
  fallback = false,
): boolean | FormulaError {
  if (!arg || isFormulaArgumentKind(arg, 'missing')) return fallback;
  const value = scalar(arg, context);
  if (isFormulaError(value)) return value;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = isFormulaText(value) ? value.value : typeof value === 'string' ? value : null;
  if (text !== null) {
    if (/^true$/i.test(text)) return true;
    if (/^false$/i.test(text)) return false;
  }
  return lookupValueError();
}

export function rangeArg(arg: FormulaArg | undefined, context: EvalContext): ResolvedFormulaRange | FormulaError {
  if (!arg) return lookupValueError();
  const range = resolveFormulaRange(arg, context);
  return range ?? lookupValueError();
}

export function matrixArg(
  arg: FormulaArg | undefined,
  context: EvalContext,
  preserveCellErrors = false,
  normalizeEmptyText = false,
): FormulaValue[][] | FormulaError {
  if (!arg) return lookupValueError();
  if (isFormulaArgumentKind(arg, 'value') || isFormulaArgumentKind(arg, 'expression')) {
    const value = readArg(arg, context);
    if (isFormulaError(value)) return preserveCellErrors ? [[value]] : value;
    if (Array.isArray(value)) return normalizeMatrix(value, normalizeEmptyText);
    return [[normalizeEmptyText ? normalizeMatrixValue(value) : value]];
  }
  const range = rangeArg(arg, context);
  if (isFormulaError(range)) return range;
  const rows: FormulaValue[][] = [];
  for (let row = range.startRow; row <= range.endRow; row++) {
    const values: FormulaValue[] = [];
    for (let col = range.startCol; col <= range.endCol; col++) {
      const value = readFormulaRangeCell(range, row, col, context);
      if (isFormulaError(value) && !preserveCellErrors) return value;
      values.push(normalizeMatrixValue(value));
    }
    rows.push(values);
  }
  return rows;
}

export function selectionIndexes(
  args: readonly FormulaArg[],
  context: EvalContext,
  size: number,
): number[] | FormulaError {
  const indexes: number[] = [];
  for (const arg of args) {
    const values = matrixArg(arg, context, true);
    if (isFormulaError(values)) return values;
    for (const row of values)
      for (const value of row) {
        const numeric = numberArg({ kind: 'value', value }, context);
        if (isFormulaError(numeric)) return numeric;
        const index = Math.trunc(numeric);
        if (index === 0 || Math.abs(index) > size) return lookupValueError();
        indexes.push(index > 0 ? index - 1 : size + index);
      }
  }
  return indexes;
}

function normalizeMatrix(value: FormulaValue[], normalizeEmptyText = true): FormulaValue[][] {
  const normalize = normalizeEmptyText ? normalizeMatrixValue : (item: FormulaValue) => item;
  return value.map((item) => (Array.isArray(item) ? item.map(normalize) : [normalize(item)]));
}

function normalizeMatrixValue(value: FormulaValue): FormulaValue {
  return value === '' || (isFormulaText(value) && value.value === '') ? null : value;
}

export function flatten(matrix: FormulaValue[][]): FormulaValue[] {
  return matrix.flatMap((row) => row);
}

export function compareValues(
  left: FormulaValue,
  right: FormulaValue,
  compareText?: (left: string, right: string) => number,
): number {
  if (isFormulaError(left)) return 1;
  if (isFormulaError(right)) return -1;
  const leftNumber = typeof left === 'number' ? left : typeof left === 'boolean' ? (left ? 1 : 0) : Number(left);
  const rightNumber = typeof right === 'number' ? right : typeof right === 'boolean' ? (right ? 1 : 0) : Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  const l = String(typeof left === 'object' && left && 'value' in left ? left.value : left).toLowerCase();
  const r = String(typeof right === 'object' && right && 'value' in right ? right.value : right).toLowerCase();
  if (
    compareText &&
    (typeof left === 'string' || isFormulaText(left)) &&
    (typeof right === 'string' || isFormulaText(right))
  )
    return compareText(l, r);
  return l < r ? -1 : l > r ? 1 : 0;
}

export function compareSortValues(left: FormulaValue, right: FormulaValue): number {
  const leftText = isFormulaText(left) ? left.value : typeof left === 'string' ? left : null;
  const rightText = isFormulaText(right) ? right.value : typeof right === 'string' ? right : null;
  if (leftText !== null && rightText !== null) {
    const l = leftText.toLowerCase();
    const r = rightText.toLowerCase();
    return l < r ? -1 : l > r ? 1 : 0;
  }
  return compareValues(left, right);
}

export function equalsValue(left: FormulaValue, right: FormulaValue): boolean {
  const leftText = isFormulaText(left) ? left.value : typeof left === 'string' ? left : null;
  const rightText = isFormulaText(right) ? right.value : typeof right === 'string' ? right : null;
  if (leftText !== null && rightText !== null) return leftText.toLowerCase() === rightText.toLowerCase();
  return compareValues(left, right) === 0;
}

/** Exact lookup does not coerce logical, text, and numeric keys into each other. */
export function sameLookupType(left: FormulaValue, right: FormulaValue): boolean {
  const category = (value: FormulaValue) =>
    typeof value === 'object' && value !== null && 'value' in value ? typeof value.value : typeof value;
  return category(left) === category(right);
}

export function matchesExactLookup(left: FormulaValue, right: FormulaValue): boolean {
  if (!sameLookupType(left, right)) return false;
  const leftText = isFormulaText(left) ? left.value : typeof left === 'string' ? left : null;
  const rightText = isFormulaText(right) ? right.value : typeof right === 'string' ? right : null;
  if (leftText !== null && rightText !== null) return leftText.toLowerCase() === rightText.toLowerCase();
  return compareValues(left, right) === 0;
}

export function matchesLookupWildcard(value: FormulaValue, pattern: FormulaValue): boolean {
  if (typeof value !== 'string' || typeof pattern !== 'string') return false;
  const expression = excelWildcardRegex(pattern);
  return expression ? new RegExp(`^(?:${expression.source})$`, expression.flags).test(value) : false;
}

export function dimensions(matrix: FormulaValue[][]): { rows: number; columns: number } {
  return { rows: matrix.length, columns: matrix.reduce((max, row) => Math.max(max, row.length), 0) };
}

export function cellAddress(row: number, col: number, absolute = true): string {
  let n = col + 1;
  let letters = '';
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return `${absolute ? '$' : ''}${letters}${absolute ? '$' : ''}${row + 1}`;
}

export function rangeDimensions(range: ResolvedFormulaRange): { rows: number; columns: number } {
  return { rows: formulaRangeHeight(range), columns: formulaRangeWidth(range) };
}

export function toText(value: FormulaValue): string {
  if (typeof value === 'object' && value !== null && 'value' in value) return String(value.value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

export function errorOrValue(value: FormulaValue): FormulaValue {
  return value;
}

export function isMissing(arg: FormulaArg | undefined): boolean {
  return !arg || isFormulaArgumentKind(arg, 'missing');
}

export function ensureArgCount(args: readonly FormulaArg[], min: number, max = min): FormulaError | undefined {
  return args.length < min || args.length > max ? lookupValueError() : undefined;
}

export function resolveTextReference(
  arg: FormulaArg | undefined,
  context: EvalContext,
  style?: 'A1' | 'R1C1',
): ResolvedFormulaRange | FormulaError {
  const value = scalar(arg, context);
  if (isFormulaError(value)) return value;
  const text =
    typeof value === 'string'
      ? value
      : typeof value === 'object' && value !== null && !Array.isArray(value) && value.kind === 'text'
      ? value.value
      : null;
  if (text === null) return lookupValueError();
  const options =
    context.currentCell || style
      ? { ...(context.currentCell ? { currentCell: context.currentCell } : {}), ...(style ? { style } : {}) }
      : undefined;
  const resolved = context.referenceResolver?.resolve(text, options);
  if (!resolved || isFormulaError(resolved)) return lookupRefError();
  context.registerDynamicDependency?.(resolved);
  return resolved;
}

export function readReferenceMatrix(
  reference: ResolvedFormulaRange,
  context: EvalContext,
): FormulaValue[][] | FormulaError {
  const value = context.readReference?.(reference);
  if (value !== undefined) {
    if (isFormulaError(value)) return value;
    return Array.isArray(value) ? normalizeMatrix(value) : (value as unknown as FormulaValue[][]);
  }
  if (reference.startRow === reference.endRow && reference.startCol === reference.endCol)
    return readFormulaRangeCell(
      reference,
      reference.startRow,
      reference.startCol,
      context,
    ) as unknown as FormulaValue[][];
  const rows: FormulaValue[][] = [];
  for (let row = reference.startRow; row <= reference.endRow; row++) {
    const current: FormulaValue[] = [];
    for (let col = reference.startCol; col <= reference.endCol; col++) {
      const cell = readFormulaRangeCell(reference, row, col, context);
      if (isFormulaError(cell)) return cell;
      current.push(cell);
    }
    rows.push(current);
  }
  return rows;
}

export function sameShape(left: FormulaValue[][], right: FormulaValue[][]): boolean {
  return left.length === right.length && left.every((row, index) => row.length === (right[index]?.length ?? -1));
}

export function transpose(matrix: FormulaValue[][]): FormulaValue[][] {
  const width = matrix.reduce((max, row) => Math.max(max, row.length), 0);
  return Array.from({ length: width }, (_, col) => matrix.map((row) => row[col] ?? ''));
}

export function asReference(range: ResolvedFormulaRange): FormulaValue {
  return { kind: 'reference', reference: range };
}
