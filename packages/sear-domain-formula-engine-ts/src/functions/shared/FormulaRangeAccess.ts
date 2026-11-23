import {
  FormulaErrorCode,
  FormulaRangeSourceKind,
  createFormulaError,
  type EvalContext,
  type FormulaError,
  type FormulaValue,
  type FormulaRangeCell,
  type ResolvedFormulaRange,
} from '@searsuite/sear-domain-formula-engine';
import { formulaRangeWidth } from './FormulaRangeGeometry';

export function readFormulaRangeCell(
  range: ResolvedFormulaRange,
  row: number,
  col: number,
  context: EvalContext,
): FormulaValue {
  if (range.source.kind === FormulaRangeSourceKind.CurrentSheet) {
    if (!context.isCellInBounds(row, col)) return createFormulaError(FormulaErrorCode.Reference);
    return context.getCellValue(row, col);
  }
  return (
    context.getWorkbookCellValue?.(range.source.sheetName, row, col) ?? createFormulaError(FormulaErrorCode.Reference)
  );
}

export function readFormulaRangeCellByOffset(
  range: ResolvedFormulaRange,
  rowOffset: number,
  colOffset: number,
  context: EvalContext,
): FormulaValue {
  return readFormulaRangeCell(range, range.startRow + rowOffset, range.startCol + colOffset, context);
}

export function forEachFormulaRangeCell(
  range: ResolvedFormulaRange,
  context: EvalContext,
  callback: (value: FormulaValue, rowOffset: number, colOffset: number) => boolean | void,
): FormulaError | undefined {
  if (range.endRow < range.startRow || range.endCol < range.startCol)
    return createFormulaError(FormulaErrorCode.Reference);
  if (range.source.kind === FormulaRangeSourceKind.CurrentSheet) {
    if (!context.isCellInBounds(range.startRow, range.startCol) || !context.isCellInBounds(range.endRow, range.endCol))
      return createFormulaError(FormulaErrorCode.Reference);
    return iterateRange(
      context.iterateRange(range.startRow, range.startCol, range.endRow, range.endCol),
      range,
      callback,
    );
  }
  if (!context.iterateWorkbookRange) return createFormulaError(FormulaErrorCode.Reference);
  return iterateRange(
    context.iterateWorkbookRange(range.source.sheetName, range.startRow, range.startCol, range.endRow, range.endCol),
    range,
    callback,
  );
}

/** Iterates range values together with coordinates and host-provided visibility/source metadata. */
export function forEachFormulaRangeCellWithMetadata(
  range: ResolvedFormulaRange,
  context: EvalContext,
  callback: (cell: FormulaRangeCell, rowOffset: number, colOffset: number) => boolean | void,
): FormulaError | undefined {
  if (range.endRow < range.startRow || range.endCol < range.startCol)
    return createFormulaError(FormulaErrorCode.Reference);
  const width = formulaRangeWidth(range);
  if (range.source.kind === FormulaRangeSourceKind.CurrentSheet) {
    if (!context.isCellInBounds(range.startRow, range.startCol) || !context.isCellInBounds(range.endRow, range.endCol))
      return createFormulaError(FormulaErrorCode.Reference);
    if (context.iterateRangeCells) {
      let index = 0;
      for (const cell of context.iterateRangeCells(range.startRow, range.startCol, range.endRow, range.endCol)) {
        if (callback(cell, Math.floor(index / width), index % width) === false) break;
        index++;
      }
      return undefined;
    }
  } else if (context.iterateWorkbookRangeCells) {
    let index = 0;
    for (const cell of context.iterateWorkbookRangeCells(
      range.source.sheetName,
      range.startRow,
      range.startCol,
      range.endRow,
      range.endCol,
    )) {
      if (callback(cell, Math.floor(index / width), index % width) === false) break;
      index++;
    }
    return undefined;
  }
  return forEachFormulaRangeCell(range, context, (value, rowOffset, colOffset) =>
    callback(createFallbackRangeCell(range, context, value, rowOffset, colOffset), rowOffset, colOffset),
  );
}

function createFallbackRangeCell(
  range: ResolvedFormulaRange,
  context: EvalContext,
  value: FormulaValue,
  rowOffset: number,
  colOffset: number,
): FormulaRangeCell {
  const row = range.startRow + rowOffset;
  const col = range.startCol + colOffset;
  const sheetName = range.source.kind === FormulaRangeSourceKind.WorkbookSheet ? range.source.sheetName : undefined;
  const source = context.metadata?.readCell({ row, col, ...(sheetName === undefined ? {} : { sheetName }) })?.source;
  return source === undefined ? { row, col, value } : { row, col, value, source };
}

function iterateRange(
  values: Iterable<FormulaValue>,
  range: ResolvedFormulaRange,
  callback: (value: FormulaValue, rowOffset: number, colOffset: number) => boolean | void,
): undefined {
  let index = 0;
  for (const value of values) {
    const width = formulaRangeWidth(range);
    const shouldContinue = callback(value, Math.floor(index / width), index % width);
    index++;
    if (shouldContinue === false) return undefined;
  }
  return undefined;
}
