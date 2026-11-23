/**
 * SUM: Adds numeric values from arguments, cells, and ranges.
 * Example: =SUM(10,20,30) returns 60.
 */
/**
 * SUM function implementation.
 *
 * Supports three argument forms:
 * 1. Range reference: SUM(A1:C100), lazily iterated without creating a large array.
 * 2. Cell reference: SUM(A1), read directly.
 * 3. Value arguments: SUM(1, 2, 3), computed directly.
 *
 * Behavior:
 * - Error propagation: any FormulaError argument returns that error.
 * - Direct numeric text and booleans are converted; referenced text and booleans are ignored.
 * - Direct non-numeric text returns a value error.
 */

import {
  isFormulaArgumentKind,
  type FormulaFunction,
  type FormulaArg,
  type FormulaValue,
  type CellChange,
  type EvalContext,
  FormulaErrorCode,
  createFormulaError,
  FormulaNodeKind,
  type ResolvedFormulaRange,
} from '@searsuite/sear-domain-formula-engine';
import { isFormulaError, isFormulaText, isNumber, toNumberOrError } from '@searsuite/sear-foundation-utils';
import { forEachFormulaRangeCell, isCurrentSheetRange, resolveFormulaRange } from '../../shared/helpers';
import { resolveConditionalReference, resolveUnionReferenceAreas } from '../../shared/conditionalReference';
import { numericDateText } from '../../shared/formulaNumericDateText';

function addToTotal(total: number, value: FormulaValue, context: EvalContext): FormulaValue {
  if (isFormulaError(value)) return value;
  if (value === '' || (isFormulaText(value) && value.value === ''))
    return createFormulaError(FormulaErrorCode.Value);
  if (isFormulaText(value) && value.numericCoercion === 'deny') {
    return createFormulaError(FormulaErrorCode.Value);
  }

  const numberValue = toNumberOrError(value);
  if (isFormulaError(numberValue)) {
    const dateValue = numericDateText(value, context);
    return dateValue === undefined ? createFormulaError(FormulaErrorCode.Value) : total + dateValue;
  }
  const result = total + numberValue;
  return Number.isFinite(result) ? result : createFormulaError(FormulaErrorCode.Number);
}

function addReferencedValue(total: number, value: FormulaValue): FormulaValue {
  if (isFormulaError(value)) return value;
  if (isFormulaText(value) && value.numericCoercion === 'deny') return createFormulaError(FormulaErrorCode.Value);
  if (!isNumber(value)) return total;
  const result = total + value;
  return Number.isFinite(result) ? result : createFormulaError(FormulaErrorCode.Number);
}

function addArrayToTotal(total: number, value: FormulaValue, context: EvalContext): FormulaValue {
  if (!Array.isArray(value)) return addToTotal(total, value, context);
  for (const item of value) {
    const next = addArrayToTotal(total, item, context);
    if (isFormulaError(next)) return next;
    total = next as number;
  }
  return total;
}

function addReferencedArrayToTotal(total: number, value: FormulaValue): FormulaValue {
  if (!Array.isArray(value)) return addReferencedValue(total, value);
  for (const item of value) {
    const next = addReferencedArrayToTotal(total, item);
    if (isFormulaError(next)) return next;
    total = next as number;
  }
  return total;
}

function sumRange(arg: FormulaArg, context: EvalContext): FormulaValue {
  const range = resolveFormulaRange(arg, context);
  if (!range || 'kind' in range) return range ?? createFormulaError(FormulaErrorCode.Value);
  return sumResolvedRange(range, context);
}

function sumResolvedRange(range: ResolvedFormulaRange, context: EvalContext): FormulaValue {
  const cached = isCurrentSheetRange(range)
    ? context.aggregationCache?.getSum(range.startRow, range.startCol, range.endRow, range.endCol)
    : undefined;
  if (cached !== void 0 && Number.isFinite(cached)) return cached;

  let total = 0;
  let rangeError: FormulaValue | undefined;
  const error = forEachFormulaRangeCell(range, context, (value) => {
    const nextTotal = addReferencedValue(total, value);
    if (!isNumber(nextTotal)) {
      rangeError = nextTotal;
      return false;
    }
    total = nextTotal;
  });
  if (error) return error;
  if (rangeError) return rangeError;
  if (isCurrentSheetRange(range))
    context.aggregationCache?.setSum(range.startRow, range.startCol, range.endRow, range.endCol, total);
  return total;
}

/** SUM function definition. */
export const SUM: FormulaFunction = {
  name: 'SUM',
  descriptor: {
    version: 1, category: 'Math', summary: 'Adds numbers and values in ranges.',
    example: '=SUM(A1:A5)',
    parameters: [{ name: 'number', description: 'Number or range to add.', repeating: true }],
  },

  evaluate(args: FormulaArg[], context: EvalContext): FormulaValue {
    if (args.length > 255) return createFormulaError(FormulaErrorCode.Value);
    let total = 0;

    for (const arg of args) {
      const areas = resolveUnionReferenceAreas(arg, context);
      if (areas) {
        if (!Array.isArray(areas)) return areas;
        for (const area of areas) {
          const next = sumResolvedRange(area, context);
          if (!isNumber(next)) return next;
          total += next;
          if (!Number.isFinite(total)) return createFormulaError(FormulaErrorCode.Number);
        }
        continue;
      }
      if (
        isFormulaArgumentKind(arg, FormulaNodeKind.Range) ||
        isFormulaArgumentKind(arg, FormulaNodeKind.WorkbookRange) ||
        isFormulaArgumentKind(arg, FormulaNodeKind.ColumnRange) ||
        isFormulaArgumentKind(arg, FormulaNodeKind.RowRange)
      ) {
        // Range reference: lazy iteration yields one cell value at a time.
        // Avoid creating a 2.6M-element array for SUM(A1:Z100000).
        const rangeTotal = sumRange(arg, context);
        if (!isNumber(rangeTotal)) return rangeTotal;
        total += rangeTotal;
        if (!Number.isFinite(total)) return createFormulaError(FormulaErrorCode.Number);
      } else if (isFormulaArgumentKind(arg, FormulaNodeKind.Cell)) {
        // Cell reference: read directly.
        const v = context.getCellValue(arg.row, arg.col);
        const nextTotal = addReferencedValue(total, v);
        if (isFormulaError(nextTotal)) return nextTotal;
        total = nextTotal as number;
      } else if (isFormulaArgumentKind(arg, FormulaNodeKind.WorkbookCell)) {
        const v =
          context.getWorkbookCellValue?.(arg.sheetName, arg.row, arg.col) ??
          createFormulaError(FormulaErrorCode.Reference);
        const nextTotal = addReferencedValue(total, v);
        if (isFormulaError(nextTotal)) return nextTotal;
        total = nextTotal as number;
      } else if (isFormulaArgumentKind(arg, 'reference')) {
        const value = context.readReference?.(arg.reference) ?? createFormulaError(FormulaErrorCode.Reference);
        if (isFormulaError(value)) return value;
        const nextTotal = addReferencedArrayToTotal(total, value);
        if (isFormulaError(nextTotal)) return nextTotal;
        total = nextTotal as number;
      } else {
        if (isFormulaArgumentKind(arg, 'missing')) continue;
        const selected = resolveConditionalReference(arg, context);
        if (selected) {
          if ('kind' in selected) return selected;
          const rangeTotal = sumResolvedRange(selected, context);
          if (!isNumber(rangeTotal)) return rangeTotal;
          total += rangeTotal;
          if (!Number.isFinite(total)) return createFormulaError(FormulaErrorCode.Number);
          continue;
        }
        if (isFormulaArgumentKind(arg, 'expression')) return createFormulaError(FormulaErrorCode.Value);
        // Value argument, either a literal or an evaluated sub-expression.
        const v = arg.value;
        if (Array.isArray(v)) {
          const nextTotal = arg.sourceKind === FormulaNodeKind.Array
            ? addArrayToTotal(total, v, context)
            : addReferencedArrayToTotal(total, v);
          if (isFormulaError(nextTotal)) return nextTotal;
          total = nextTotal as number;
        } else {
          const nextTotal = addToTotal(total, v, context);
          if (isFormulaError(nextTotal)) return nextTotal;
          total = nextTotal as number;
        }
      }
    }

    return total;
  },

  /**
   * Incremental update: newSum = prevSum + delta.
   *
   * When a cell value changes, SUM can update by computing only the delta.
   * Complexity is O(changed cells) instead of O(range size).
   */
  incrementalUpdate(prevResult: FormulaValue, changedCells: CellChange[]): FormulaValue {
    // If the previous result is already an error, it cannot be updated incrementally.
    if (isFormulaError(prevResult)) return prevResult;

    let delta = 0;
    for (const { oldVal, newVal } of changedCells) {
      // New value is an error -> propagate it.
      if (isFormulaError(newVal)) return newVal;
      delta += (isNumber(newVal) ? newVal : 0) - (isNumber(oldVal) ? oldVal : 0);
    }
    const result = (prevResult as number) + delta;
    return Number.isFinite(result) ? result : createFormulaError(FormulaErrorCode.Number);
  },
};
