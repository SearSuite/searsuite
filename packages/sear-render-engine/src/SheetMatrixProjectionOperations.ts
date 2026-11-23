import { CSRMatrix } from '@searsuite/sear-domain-matrix';
import {
  MatrixOT,
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
import { type SheetMatrix, type CellMatrixElement } from './SheetMatrices';

/**
 * Reads a dense row snapshot from a sparse matrix.
 * @param matrix - Matrix to read.
 * @param rowIndex - Row index to snapshot.
 * @returns Dense row including null entries for empty cells.
 */
export function readDenseRow<T>(matrix: CSRMatrix<T>, rowIndex: number): (T | null)[] {
  const row: (T | null)[] = [];
  for (let col = 0; col < matrix.shape[1]; col++) row.push(matrix.getItem(rowIndex, col));
  return row;
}

/**
 * Reads a dense column snapshot from a sparse matrix.
 * @param matrix - Matrix to read.
 * @param colIndex - Column index to snapshot.
 * @returns Dense column including null entries for empty cells.
 */
export function readDenseColumn<T>(matrix: CSRMatrix<T>, colIndex: number): (T | null)[] {
  const column: (T | null)[] = [];
  for (let row = 0; row < matrix.shape[0]; row++) column.push(matrix.getItem(row, colIndex));
  return column;
}

/**
 * Builds invertible operations for a matrix projection by replaying through a cloned snapshot.
 * @param matrix - Projection matrix before the transaction.
 * @param operations - Source transaction operations.
 * @param createInvertible - Projection-specific operation builder.
 * @returns Ordered MatrixOT operations with completed inverse payloads.
 */
export function createInvertibleProjectedOperations<T>(
  matrix: CSRMatrix<T>,
  operations: Operation[],
  createInvertible: (matrix: CSRMatrix<T>, operation: Operation) => MatrixOTOperation<T> | null,
): MatrixOTOperation<T>[] {
  const snapshot = matrix.clone();
  const invertibleOperations: MatrixOTOperation<T>[] = [];
  operations.forEach((operation) => {
    const invertibleOperation = createInvertible(snapshot, operation);
    if (!invertibleOperation) return;
    invertibleOperations.push(invertibleOperation);
    MatrixOT.apply(snapshot, [invertibleOperation]);
  });
  return invertibleOperations;
}

/**
 * Converts one external sheet-data operation into an invertible MatrixOT component.
 * @param matrix - Current sheet matrix snapshot used to fill missing previous payloads.
 * @param operation - Incoming operation from a transaction.
 * @returns Matrix operation carrying enough state for inversion, or null when unrelated.
 */
export function createInvertibleSheetDataOperation(
  matrix: SheetMatrix,
  operation: Operation,
): MatrixOTOperation<CellMatrixElement> | null {
  if (isUpdateCellOperation<CellMatrixElement>(operation)) {
    const [row, col] = operation.p;
    return createUpdateCellOTOperation(
      [row, col],
      operation.uc.value,
      operation.uc.prev === void 0 ? matrix.getItem(row, col) : operation.uc.prev,
      operation.uc.intent,
    );
  }
  if (!isMatrixStructureOperation(operation)) return null;
  if (MatrixOTActionName.RowInsert in operation && operation.ri !== void 0) {
    return createInsertRowOTOperation(operation.p, operation.ri as (CellMatrixElement | null)[]);
  }
  if (MatrixOTActionName.RowDelete in operation && operation.rd !== void 0) {
    return createDeleteRowOTOperation(operation.p, readDenseRow(matrix, operation.p[0]));
  }
  if (MatrixOTActionName.RowMove in operation && operation.rm !== void 0) {
    return createMoveRowOTOperation(operation.p, operation.rm);
  }
  if (MatrixOTActionName.ColInsert in operation && operation.ci !== void 0) {
    return createInsertColOTOperation(operation.p, operation.ci as (CellMatrixElement | null)[]);
  }
  if (MatrixOTActionName.ColDelete in operation && operation.cd !== void 0) {
    return createDeleteColOTOperation(operation.p, readDenseColumn(matrix, operation.p[0]));
  }
  if (MatrixOTActionName.ColMove in operation && operation.cm !== void 0) {
    return createMoveColOTOperation(operation.p, operation.cm);
  }
  return null;
}
