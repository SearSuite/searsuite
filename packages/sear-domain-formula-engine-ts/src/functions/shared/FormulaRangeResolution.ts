import {
  isFormulaArgumentKind,
  FormulaErrorCode,
  FormulaNodeKind,
  FormulaRangeSourceKind,
  createFormulaError,
  type EvalContext,
  type FormulaArg,
  type FormulaError,
  type ResolvedFormulaRange,
} from '@searsuite/sear-domain-formula-engine';

export function resolveFormulaRange(
  arg: FormulaArg,
  context: EvalContext,
): ResolvedFormulaRange | FormulaError | undefined {
  if (isFormulaArgumentKind(arg, FormulaNodeKind.Range))
    return createCurrentSheetRange(arg.start[0], arg.start[1], arg.end[0], arg.end[1]);
  if (isFormulaArgumentKind(arg, FormulaNodeKind.Cell))
    return createCurrentSheetRange(arg.row, arg.col, arg.row, arg.col);
  if (isFormulaArgumentKind(arg, FormulaNodeKind.WorkbookCell))
    return createWorkbookSheetRange(arg.sheetName, arg.row, arg.col, arg.row, arg.col);
  if (isFormulaArgumentKind(arg, FormulaNodeKind.WorkbookRange))
    return createWorkbookSheetRange(arg.sheetName, arg.start[0], arg.start[1], arg.end[0], arg.end[1]);
  if (isFormulaArgumentKind(arg, FormulaNodeKind.ColumnRange)) {
    const [rowCount] = context.getSheetShape?.() ?? [0, 0];
    return rowCount > 0
      ? createCurrentSheetRange(0, arg.startCol, rowCount - 1, arg.endCol)
      : createFormulaError(FormulaErrorCode.Reference);
  }
  if (isFormulaArgumentKind(arg, FormulaNodeKind.RowRange)) {
    const [, colCount] = context.getSheetShape?.() ?? [0, 0];
    return colCount > 0
      ? createCurrentSheetRange(arg.startRow, 0, arg.endRow, colCount - 1)
      : createFormulaError(FormulaErrorCode.Reference);
  }
  if (isFormulaArgumentKind(arg, 'reference')) return arg.reference;
  return undefined;
}

function createCurrentSheetRange(
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
): ResolvedFormulaRange {
  return { source: { kind: FormulaRangeSourceKind.CurrentSheet }, startRow, startCol, endRow, endCol };
}

function createWorkbookSheetRange(
  sheetName: string,
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
): ResolvedFormulaRange {
  return { source: { kind: FormulaRangeSourceKind.WorkbookSheet, sheetName }, startRow, startCol, endRow, endCol };
}
