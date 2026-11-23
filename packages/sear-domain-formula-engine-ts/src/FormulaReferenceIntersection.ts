import {
  createFormulaError,
  FormulaErrorCode,
  FormulaNodeKind,
  isFormulaError,
  type EvalContext,
  type FormulaAST,
  type FormulaError,
} from '@searsuite/sear-domain-formula-engine';

interface ReferenceBounds {
  readonly sheetName?: string;
  readonly startRow: number;
  readonly startCol: number;
  readonly endRow: number;
  readonly endCol: number;
}

type IntersectionReference =
  | { kind: typeof FormulaNodeKind.Cell; row: number; col: number }
  | { kind: typeof FormulaNodeKind.Range; start: [number, number]; end: [number, number] }
  | { kind: typeof FormulaNodeKind.WorkbookCell; sheetName: string; row: number; col: number }
  | { kind: typeof FormulaNodeKind.WorkbookRange; sheetName: string; start: [number, number]; end: [number, number] };

/** Resolves Excel's whitespace reference-intersection operator without expanding cells. */
export function resolveReferenceIntersection(ast: FormulaAST, context: EvalContext): IntersectionReference | FormulaError {
  const bounds = referenceBounds(ast, context);
  if (isFormulaError(bounds)) return bounds;
  const { sheetName, startRow, startCol, endRow, endCol } = bounds;
  if (startRow > endRow || startCol > endCol) return createFormulaError(FormulaErrorCode.NullIntersection);
  if (sheetName === undefined) {
    if (!context.isCellInBounds(startRow, startCol) || !context.isCellInBounds(endRow, endCol)) {
      return createFormulaError(FormulaErrorCode.Reference);
    }
    return startRow === endRow && startCol === endCol
      ? { kind: FormulaNodeKind.Cell, row: startRow, col: startCol }
      : { kind: FormulaNodeKind.Range, start: [startRow, startCol], end: [endRow, endCol] };
  }
  if (!context.getWorkbookCellValue) return createFormulaError(FormulaErrorCode.Reference);
  return startRow === endRow && startCol === endCol
    ? { kind: FormulaNodeKind.WorkbookCell, sheetName, row: startRow, col: startCol }
    : { kind: FormulaNodeKind.WorkbookRange, sheetName, start: [startRow, startCol], end: [endRow, endCol] };
}

function referenceBounds(ast: FormulaAST, context: EvalContext): ReferenceBounds | FormulaError {
  switch (ast.kind) {
    case FormulaNodeKind.Cell:
      return { startRow: ast.row, endRow: ast.row, startCol: ast.col, endCol: ast.col };
    case FormulaNodeKind.Range:
      return { startRow: Math.min(ast.start[0], ast.end[0]), endRow: Math.max(ast.start[0], ast.end[0]),
        startCol: Math.min(ast.start[1], ast.end[1]), endCol: Math.max(ast.start[1], ast.end[1]) };
    case FormulaNodeKind.WorkbookCell:
      return { sheetName: ast.sheetName, startRow: ast.row, endRow: ast.row, startCol: ast.col, endCol: ast.col };
    case FormulaNodeKind.WorkbookRange:
      return { sheetName: ast.sheetName, startRow: Math.min(ast.start[0], ast.end[0]), endRow: Math.max(ast.start[0], ast.end[0]),
        startCol: Math.min(ast.start[1], ast.end[1]), endCol: Math.max(ast.start[1], ast.end[1]) };
    case FormulaNodeKind.ColumnRange: {
      const [rows] = context.getSheetShape?.() ?? [0, 0];
      return rows > 0 ? { startRow: 0, endRow: rows - 1, startCol: ast.startCol, endCol: ast.endCol }
        : createFormulaError(FormulaErrorCode.Reference);
    }
    case FormulaNodeKind.RowRange: {
      const [, cols] = context.getSheetShape?.() ?? [0, 0];
      return cols > 0 ? { startRow: ast.startRow, endRow: ast.endRow, startCol: 0, endCol: cols - 1 }
        : createFormulaError(FormulaErrorCode.Reference);
    }
    case FormulaNodeKind.Intersection: {
      const left = referenceBounds(ast.left, context);
      if (isFormulaError(left)) return left;
      const right = referenceBounds(ast.right, context);
      if (isFormulaError(right)) return right;
      if (left.sheetName !== right.sheetName) return createFormulaError(FormulaErrorCode.NullIntersection);
      return {
        ...(left.sheetName === undefined ? {} : { sheetName: left.sheetName }),
        startRow: Math.max(left.startRow, right.startRow),
        startCol: Math.max(left.startCol, right.startCol),
        endRow: Math.min(left.endRow, right.endRow),
        endCol: Math.min(left.endCol, right.endCol),
      };
    }
    default:
      return createFormulaError(FormulaErrorCode.Value);
  }
}
