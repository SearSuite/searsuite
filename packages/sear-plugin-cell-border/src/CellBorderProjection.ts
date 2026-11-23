import {
  MatrixOTActionName,
  createDeleteColOTOperation,
  createDeleteRowOTOperation,
  createInsertColOTOperation,
  createInsertRowOTOperation,
  createMoveColOTOperation,
  createMoveRowOTOperation,
  createUpdateCellOTOperation,
  isMatrixStructureOperation,
  isUpdateCellOperation,
  type MatrixOTOperation,
  type Operation,
} from '@searsuite/sear-domain-ot';
import { type CSRMatrix } from '@searsuite/sear-domain-matrix';
import { type SheetCellBorder } from './SheetCellBorder';

/** Projects structural operations into the independent border matrix. */
export function createCellBorderOperation(
  matrix: CSRMatrix<SheetCellBorder | null>,
  operation: Operation,
  direct: boolean,
): MatrixOTOperation<SheetCellBorder | null> | null {
  if (isUpdateCellOperation<SheetCellBorder | null>(operation)) {
    if (!direct) return null;
    const [row, col] = operation.p;
    return createUpdateCellOTOperation(
      [row, col],
      operation.uc.value,
      operation.uc.prev === void 0 ? matrix.getItem(row, col) : operation.uc.prev,
    );
  }
  if (!isMatrixStructureOperation(operation)) return null;
  if (MatrixOTActionName.RowInsert in operation && operation.ri !== void 0)
    return createInsertRowOTOperation(operation.p, Array(matrix.shape[1]).fill(null));
  if (MatrixOTActionName.RowDelete in operation && operation.rd !== void 0)
    return createDeleteRowOTOperation(operation.p, readSparseRow(matrix, operation.p[0]));
  if (MatrixOTActionName.RowMove in operation && operation.rm !== void 0)
    return createMoveRowOTOperation(operation.p, operation.rm);
  if (MatrixOTActionName.ColInsert in operation && operation.ci !== void 0)
    return createInsertColOTOperation(operation.p, Array(matrix.shape[0]).fill(null));
  if (MatrixOTActionName.ColDelete in operation && operation.cd !== void 0)
    return createDeleteColOTOperation(operation.p, readSparseColumn(matrix, operation.p[0]));
  if (MatrixOTActionName.ColMove in operation && operation.cm !== void 0)
    return createMoveColOTOperation(operation.p, operation.cm);
  return null;
}

function readSparseRow(matrix: CSRMatrix<SheetCellBorder | null>, rowIndex: number): (SheetCellBorder | null)[] {
  const row: (SheetCellBorder | null)[] = Array(matrix.shape[1]).fill(null);
  matrix.forEachStoredInRow(rowIndex, (value, column) => {
    row[column] = value;
  });
  return row;
}

function readSparseColumn(matrix: CSRMatrix<SheetCellBorder | null>, columnIndex: number): (SheetCellBorder | null)[] {
  const column: (SheetCellBorder | null)[] = Array(matrix.shape[0]).fill(null);
  matrix.forEachStored((value, row, currentColumn) => {
    if (currentColumn === columnIndex) column[row] = value;
  });
  return column;
}
