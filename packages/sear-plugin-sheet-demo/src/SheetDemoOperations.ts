import { type CSRMatrix } from '@searsuite/sear-domain-matrix';
import {
  MatrixOTActionName, createDeleteColOTOperation, createDeleteRowOTOperation,
  createInsertColOTOperation, createInsertRowOTOperation, createMoveColOTOperation,
  createMoveRowOTOperation, createUpdateCellOTOperation, isMatrixStructureOperation,
  isUpdateCellOperation, type MatrixOTOperation, type Operation,
} from '@searsuite/sear-domain-ot';
import { readDenseColumn, readDenseRow } from '@searsuite/sear-render-engine';
import { type SheetDemoMarker } from './SheetDemoMarker';

/** Project one direct marker edit or one shared row/column structure operation. */
export function projectMarkerOperation(
  matrix: CSRMatrix<SheetDemoMarker | null>,
  operation: Operation,
  direct: boolean,
): MatrixOTOperation<SheetDemoMarker | null> | null {
  if (isUpdateCellOperation<SheetDemoMarker | null>(operation)) {
    if (!direct) return null;
    const [row, column] = operation.p;
    return createUpdateCellOTOperation(
      [row, column], operation.uc.value,
      operation.uc.prev === void 0 ? matrix.getItem(row, column) : operation.uc.prev,
    );
  }
  if (!isMatrixStructureOperation(operation)) return null;
  if (MatrixOTActionName.RowInsert in operation && operation.ri !== void 0)
    return createInsertRowOTOperation(operation.p, Array(matrix.shape[1]).fill(null));
  if (MatrixOTActionName.RowDelete in operation && operation.rd !== void 0)
    return createDeleteRowOTOperation(operation.p, readDenseRow(matrix, operation.p[0]));
  if (MatrixOTActionName.RowMove in operation && operation.rm !== void 0)
    return createMoveRowOTOperation(operation.p, operation.rm);
  if (MatrixOTActionName.ColInsert in operation && operation.ci !== void 0)
    return createInsertColOTOperation(operation.p, Array(matrix.shape[0]).fill(null));
  if (MatrixOTActionName.ColDelete in operation && operation.cd !== void 0)
    return createDeleteColOTOperation(operation.p, readDenseColumn(matrix, operation.p[0]));
  if (MatrixOTActionName.ColMove in operation && operation.cm !== void 0)
    return createMoveColOTOperation(operation.p, operation.cm);
  return null;
}
