/**
 * COUNT: Counts numeric values in the supplied arguments and ranges.
 * Example: =COUNT(10,20,30) returns 3.
 */
/**
 * COUNT function implementation.
 *
 * COUNT follows the engine's current numeric-cell contract:
 * - references count only runtime number values;
 * - direct number and boolean arguments are counted;
 * - references to error/text/boolean values are ignored;
 * - direct error arguments still propagate as errors.
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
import { isFormulaError, isNumber } from '@searsuite/sear-foundation-utils';
import { forEachFormulaRangeCellWithMetadata, isCurrentSheetRange, resolveFormulaRange } from '../../shared/helpers';
import { resolveConditionalReference } from '../../shared/conditionalReference';
import { directStatisticalNumber } from '../statistics/statisticalInput';

function countArrayValues(values: FormulaValue[]): number {
  let total = 0;
  for (const value of values) {
    if (Array.isArray(value)) {
      total += countArrayValues(value);
    } else if (isNumber(value)) {
      total++;
    }
  }
  return total;
}

function countReferenceValue(value: FormulaValue): number {
  if (Array.isArray(value)) return countArrayValues(value);
  return isNumber(value) ? 1 : 0;
}

function countDirectValue(value: FormulaValue): number {
  if (Array.isArray(value)) {
    let total = 0;
    for (const item of value) total += countDirectValue(item);
    return total;
  }
  return isNumber(value) || typeof value === 'boolean' ? 1 : 0;
}

function countRange(arg: FormulaArg, context: EvalContext): FormulaValue {
  const range = resolveFormulaRange(arg, context);
  if (!range || 'kind' in range) return range ?? createFormulaError(FormulaErrorCode.Value);
  return countResolvedRange(range, context);
}

function countResolvedRange(range: ResolvedFormulaRange, context: EvalContext): FormulaValue {
  const cached = isCurrentSheetRange(range)
    ? context.aggregationCache?.getCount(range.startRow, range.startCol, range.endRow, range.endCol)
    : undefined;
  if (cached !== void 0 && !Number.isNaN(cached)) return cached;

  let total = 0;
  const error = forEachFormulaRangeCellWithMetadata(range, context, (cell) => {
    if (cell.source !== 'empty') total += countReferenceValue(cell.value);
  });
  if (error) return error;
  if (isCurrentSheetRange(range))
    context.aggregationCache?.setCount(range.startRow, range.startCol, range.endRow, range.endCol, total);
  return total;
}

/** COUNT function definition. */
export const COUNT: FormulaFunction = {
  name: 'COUNT',
  descriptor: {
    version: 1, category: 'Math', summary: 'Counts numeric values.',
    example: '=COUNT(A1:A5)',
    parameters: [{ name: 'value', description: 'Value or range to count.', repeating: true }],
  },

  evaluate(args: FormulaArg[], context: EvalContext): FormulaValue {
    let total = 0;

    for (const arg of args) {
      if (
        isFormulaArgumentKind(arg, FormulaNodeKind.Range) ||
        isFormulaArgumentKind(arg, FormulaNodeKind.WorkbookRange) ||
        isFormulaArgumentKind(arg, FormulaNodeKind.ColumnRange) ||
        isFormulaArgumentKind(arg, FormulaNodeKind.RowRange)
      ) {
        const rangeCount = countRange(arg, context);
        if (!isNumber(rangeCount)) return rangeCount;
        total += rangeCount;
      } else if (isFormulaArgumentKind(arg, FormulaNodeKind.Cell)) {
        const source = context.metadata?.readCell({ row: arg.row, col: arg.col })?.source;
        if (source !== 'empty') total += countReferenceValue(context.getCellValue(arg.row, arg.col));
      } else if (isFormulaArgumentKind(arg, FormulaNodeKind.WorkbookCell)) {
        const source = context.metadata?.readCell({ sheetName: arg.sheetName, row: arg.row, col: arg.col })?.source;
        if (source !== 'empty')
          total += countReferenceValue(
            context.getWorkbookCellValue?.(arg.sheetName, arg.row, arg.col) ??
              createFormulaError(FormulaErrorCode.Reference),
          );
      } else if (isFormulaArgumentKind(arg, 'reference')) {
        const value = context.readReference?.(arg.reference) ?? createFormulaError(FormulaErrorCode.Reference);
        if (isFormulaError(value)) return value;
        total += countDirectValue(value);
      } else {
        if (isFormulaArgumentKind(arg, 'missing')) continue;
        const selected = resolveConditionalReference(arg, context);
        if (selected) {
          if ('kind' in selected) return selected;
          const rangeCount = countResolvedRange(selected, context);
          if (!isNumber(rangeCount)) return rangeCount;
          total += rangeCount;
          continue;
        }
        if (isFormulaArgumentKind(arg, 'expression')) return createFormulaError(FormulaErrorCode.Value);
        const value = arg.value;
        if (isFormulaError(value)) return value;
        if (typeof directStatisticalNumber(arg, context) === 'number') {
          total++;
          continue;
        }
        total += countDirectValue(value);
      }
    }

    return total;
  },

  incrementalUpdate(prevResult: FormulaValue, changedCells: CellChange[]): FormulaValue {
    if (isFormulaError(prevResult)) return prevResult;

    let delta = 0;
    for (const { oldVal, newVal } of changedCells) {
      delta += countReferenceValue(newVal) - countReferenceValue(oldVal);
    }

    return (prevResult as number) + delta;
  },
};
