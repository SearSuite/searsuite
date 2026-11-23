import {
  isFormulaArgumentKind,
  FormulaErrorCode,
  FormulaNodeKind,
  createFormulaError,
  type EvalContext,
  type FormulaArg,
  type FormulaError,
  type FormulaFunction,
  type FormulaRangeCell,
  type FormulaValue,
  type ResolvedFormulaRange,
} from '@searsuite/sear-domain-formula-engine';
import { isFormulaText, toNumberOrError, toNumberOrZero } from '@searsuite/sear-foundation-utils';
import {
  forEachFormulaRangeCell,
  forEachFormulaRangeCellWithMetadata,
  readArg,
  resolveFormulaRange,
} from '../../shared/helpers';
import { numericDateText } from '../../shared/formulaNumericDateText';
import { isBlankScalarInput } from '../../shared/blankScalarInput';
import { resolveConditionalReference } from '../../shared/conditionalReference';
import { mapArrayValues, readArrayArgument } from '../../shared/arrayArgumentValues';

export type NumericResult = number | FormulaError;
export type FormulaMatrix = FormulaValue[][];
export type CollectedCell = FormulaRangeCell | FormulaValue;

/**
 * The foundation guard is intentionally generic for legacy callers. Formula
 * math code needs a concrete guard so arrays and scalar values narrow safely.
 */
export function isFormulaErrorValue(value: unknown): value is FormulaError {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'error' &&
    typeof (value as { code?: unknown }).code === 'string'
  );
}

export function valueError(): FormulaError {
  return createFormulaError(FormulaErrorCode.Value);
}

export function nameError(): FormulaError {
  return createFormulaError(FormulaErrorCode.Name);
}

export function numberError(): FormulaError {
  return createFormulaError(FormulaErrorCode.Number);
}

export function divisionError(): FormulaError {
  return createFormulaError(FormulaErrorCode.DivisionByZero);
}

export function isRangeArgument(arg: FormulaArg | undefined): boolean {
  if (arg === undefined) return false;
  return (
    isFormulaArgumentKind(arg, FormulaNodeKind.Range) ||
    isFormulaArgumentKind(arg, FormulaNodeKind.WorkbookRange) ||
    isFormulaArgumentKind(arg, FormulaNodeKind.ColumnRange) ||
    isFormulaArgumentKind(arg, FormulaNodeKind.RowRange) ||
    isFormulaArgumentKind(arg, FormulaNodeKind.Cell) ||
    isFormulaArgumentKind(arg, FormulaNodeKind.WorkbookCell)
  );
}

export function readScalar(
  args: FormulaArg[], index: number, context: EvalContext, fallback?: number, rejectBoolean = false,
  parseDateText = true,
): NumericResult {
  const arg = args[index];
  if (arg === undefined || isFormulaArgumentKind(arg, 'missing')) {
    return fallback === undefined ? valueError() : fallback;
  }

  return numericScalarValue(readArg(arg, context), context, rejectBoolean, parseDateText);
}

function numericScalarValue(
  value: FormulaValue,
  context: EvalContext,
  rejectBoolean: boolean,
  parseDateText: boolean,
): NumericResult {
  if (isFormulaErrorValue(value)) return value;
  if (Array.isArray(value)) return valueError();
  if (rejectBoolean && typeof value === 'boolean') return valueError();
  if (value === '' || (isFormulaText(value) && value.value === '')) return valueError();

  const numeric = toNumberOrError(value);
  return isFormulaErrorValue(numeric)
    ? parseDateText ? numericDateText(value, context) ?? valueError() : valueError()
    : numeric;
}

export function readText(args: FormulaArg[], index: number, context: EvalContext): string | FormulaError {
  const arg = args[index];
  if (arg === undefined || isFormulaArgumentKind(arg, 'missing')) return valueError();

  const value = readArg(arg, context);
  if (isFormulaErrorValue(value)) return value;
  if (Array.isArray(value)) return valueError();
  if (isFormulaText(value)) return value.value;
  return typeof value === 'string' ? value : String(value);
}

export function integerArgument(
  args: FormulaArg[],
  index: number,
  context: EvalContext,
  fallback?: number,
): NumericResult {
  const result = readScalar(args, index, context, fallback);
  return isFormulaErrorValue(result) ? result : Math.trunc(result);
}

export function strictInteger(
  args: FormulaArg[],
  index: number,
  context: EvalContext,
  fallback?: number,
): NumericResult {
  const result = readScalar(args, index, context, fallback);
  if (isFormulaErrorValue(result)) return result;
  return Number.isInteger(result) ? result : valueError();
}

export function flatten(value: FormulaValue): FormulaValue[] {
  if (!Array.isArray(value)) return [value];
  const result: FormulaValue[] = [];
  for (const item of value) result.push(...flatten(item));
  return result;
}

export function numericValue(value: FormulaValue, ignoreText = false): NumericResult {
  if (isFormulaErrorValue(value)) return value;
  if (isFormulaText(value) && value.numericCoercion === 'deny') return ignoreText ? 0 : valueError();

  const numeric = toNumberOrError(value);
  if (isFormulaErrorValue(numeric)) return ignoreText ? 0 : valueError();
  return numeric;
}

export function numericOrZero(value: FormulaValue): number {
  return toNumberOrZero(value);
}

export function isRangeCell(value: CollectedCell): value is FormulaRangeCell {
  return typeof value === 'object' && value !== null && 'row' in value && 'col' in value && 'value' in value;
}

export function matrixFromArg(
  arg: FormulaArg,
  context: EvalContext,
  options: { rejectBlankCells?: boolean } = {},
): FormulaMatrix | FormulaError {
  if (isRangeArgument(arg)) {
    const range = resolveFormulaRange(arg, context);
    if (!range || 'kind' in range) return range ?? valueError();

    const rows: FormulaMatrix = [];
    const width = range.endCol - range.startCol + 1;
    let current: FormulaValue[] = [];
    let blankCell = false;
    const append = (value: FormulaValue) => {
      current.push(value);
      if (current.length === width) {
        rows.push(current);
        current = [];
      }
    };
    const error = options.rejectBlankCells
      ? forEachFormulaRangeCellWithMetadata(range, context, (cell) => {
          if (cell.source === 'empty') {
            blankCell = true;
            return false;
          }
          append(cell.value);
        })
      : forEachFormulaRangeCell(range, context, append);
    if (error) return error;
    if (blankCell) return valueError();
    if (current.length > 0) rows.push(current);
    return rows;
  }

  if (options.rejectBlankCells && isBlankScalarInput(arg, context)) return valueError();
  const value = readArg(arg, context);
  if (isFormulaErrorValue(value)) return value;
  if (!Array.isArray(value)) return [[value]];

  // Formula array constants are already rectangular. The fallback also
  // handles a one-dimensional array supplied by a third-party context.
  const rows: FormulaMatrix = [];
  for (const row of value) rows.push(Array.isArray(row) ? row.slice() : [row]);
  return rows.length > 0 ? rows : valueError();
}

export function matrixDimensions(matrix: FormulaMatrix): [number, number] | FormulaError {
  if (matrix.length === 0) return valueError();
  const width = matrix[0]?.length ?? 0;
  if (width === 0 || matrix.some((row) => row.length !== width)) return valueError();
  return [matrix.length, width];
}

export function matrixNumbers(matrix: FormulaMatrix, ignoreText = false): number[][] | FormulaError {
  const dimensions = matrixDimensions(matrix);
  if (isFormulaErrorValue(dimensions)) return dimensions;

  const result: number[][] = [];
  for (const row of matrix) {
    const numericRow: number[] = [];
    for (const value of row) {
      if (!ignoreText) {
        if (isFormulaErrorValue(value)) return value;
        if (typeof value !== 'number' || !Number.isFinite(value)) return valueError();
        numericRow.push(value);
        continue;
      }
      if (isFormulaErrorValue(value)) return value;
      numericRow.push(typeof value === 'number' && Number.isFinite(value) ? value : 0);
    }
    result.push(numericRow);
  }
  return result;
}

export function collectReferenceCells(
  arg: FormulaArg | undefined,
  context: EvalContext,
  resolvedRange?: ResolvedFormulaRange,
): FormulaRangeCell[] | FormulaValue[] | FormulaError {
  if (arg === undefined || isFormulaArgumentKind(arg, 'missing')) return valueError();
  if (!resolvedRange && !isRangeArgument(arg)) {
    const value = readArg(arg, context);
    return isFormulaErrorValue(value) ? value : [value];
  }

  const range = resolvedRange ?? resolveFormulaRange(arg, context);
  if (!range || 'kind' in range) return range ?? valueError();

  const cells: FormulaRangeCell[] = [];
  const error = forEachFormulaRangeCellWithMetadata(range, context, (cell) => {
    cells.push(cell);
  });
  return error ?? cells;
}

export function collectValues(arg: FormulaArg, context: EvalContext): FormulaValue[] | FormulaError {
  const cells = collectReferenceCells(arg, context);
  if (isFormulaErrorValue(cells)) return cells;
  const values: FormulaValue[] = [];
  for (const cell of cells) {
    const value = isRangeCell(cell) ? cell.value : cell;
    values.push(...flatten(value));
  }
  return values;
}

export function collectNumbers(
  args: FormulaArg[],
  context: EvalContext,
  options: { ignoreText?: boolean; referenceOnly?: boolean; referenceNumericOnly?: boolean } = {},
): number[] | FormulaError {
  const values: number[] = [];
  for (const arg of args) {
    if (options.referenceOnly && !isRangeArgument(arg)) return valueError();
    const reference = options.referenceNumericOnly ? resolveConditionalReference(arg, context) : undefined;
    if (isFormulaErrorValue(reference)) return reference;
    const collected = reference
      ? collectReferenceCells(arg, context, reference)
      : collectValues(arg, context);
    if (isFormulaErrorValue(collected)) return collected;

    for (const entry of collected) {
      if (options.referenceNumericOnly && isRangeCell(entry)) {
        if (isFormulaErrorValue(entry.value)) return entry.value;
        if (entry.source === 'empty' || typeof entry.value !== 'number') continue;
        values.push(entry.value);
        continue;
      }
      const value = entry as FormulaValue;
      if (options.referenceNumericOnly && arg.kind === 'value' &&
        arg.sourceKind === FormulaNodeKind.String &&
        (value === '' || isFormulaText(value) && value.value === '')) {
        return valueError();
      }
      const numeric = numericValue(value, options.ignoreText === true);
      const converted = isFormulaErrorValue(numeric) && !options.ignoreText
        ? numericDateText(value, context) ?? numeric
        : numeric;
      if (isFormulaErrorValue(converted)) return converted;
      values.push(converted);
    }
  }
  return values;
}

export function forEachNumericValue(
  args: FormulaArg[],
  context: EvalContext,
  callback: (value: number) => void,
  options: { ignoreText?: boolean } = {},
): FormulaError | undefined {
  for (const arg of args) {
    if (isRangeArgument(arg)) {
      const range = resolveFormulaRange(arg, context);
      if (!range || 'kind' in range) return range ?? valueError();

      let callbackError: FormulaError | undefined;
      const error = forEachFormulaRangeCell(range, context, (value) => {
        const numeric = numericValue(value, options.ignoreText === true);
        if (isFormulaErrorValue(numeric)) {
          callbackError = numeric;
          return false;
        }
        callback(numeric);
      });
      if (error) return error;
      if (callbackError) return callbackError;
      continue;
    }

    const value = readArg(arg, context);
    if (isFormulaErrorValue(value)) return value;
    for (const item of flatten(value)) {
      const numeric = numericValue(item, options.ignoreText === true);
      if (isFormulaErrorValue(numeric)) return numeric;
      callback(numeric);
    }
  }
  return undefined;
}

export function evaluateUnaryNumeric(
  name: string,
  operation: (value: number) => NumericResult,
  minArgs: number,
  maxArgs: number,
  arityError: () => FormulaError = valueError,
  parseDateText = true,
): FormulaFunction {
  return {
    name,
    evaluate(args, context): FormulaValue {
      if (args.length < minArgs || args.length > maxArgs) return arityError();
      const argument = readArrayArgument(args[0], context, true);
      const calculate = (value: NumericResult): NumericResult => {
        if (isFormulaErrorValue(value)) return value;
        const result = operation(value);
        return typeof result === 'number' && !Number.isFinite(result) ? numberError() : result;
      };
      if (Array.isArray(argument)) return mapArrayValues(argument, (item) =>
        calculate(item === null ? 0 : numericScalarValue(item, context, false, parseDateText)));
      return calculate(numericScalarValue(argument, context, false, parseDateText));
    },
  };
}

export function evaluateBinaryNumeric(
  name: string,
  operation: (left: number, right: number) => NumericResult,
  arityError: () => FormulaError = valueError,
): FormulaFunction {
  return {
    name,
    evaluate(args, context): FormulaValue {
      if (args.length !== 2) return arityError();
      const left = readScalar(args, 0, context);
      if (isFormulaErrorValue(left)) return left;
      const right = readScalar(args, 1, context);
      return isFormulaErrorValue(right) ? right : operation(left, right);
    },
  };
}

export function rangeDimensions(range: ResolvedFormulaRange): [number, number] {
  return [range.endRow - range.startRow + 1, range.endCol - range.startCol + 1];
}

export function sameDimensions(left: [number, number], right: [number, number]): boolean {
  return left[0] === right[0] && left[1] === right[1];
}
