import { type CellMatrixElement } from '@searsuite/sear-domain-cell-types';
import { isUpdateCellOperation, type Operation } from '@searsuite/sear-domain-ot';
import {
  matrixOperationToStructureChange,
  type StructureChange,
  shiftStructureCoordinate,
  StructureChangeAxis,
} from '@searsuite/sear-domain-formula-engine';
import { type WorkbookCellReference, type WorkbookSheetId } from '@searsuite/sear-domain-workbook';

/** Resolves updates at their final transaction positions, including inverse updates preceding swaps. */
export function readWorkbookUpdatedCells(
  sheetId: WorkbookSheetId,
  operations: readonly Operation[],
): Array<{ reference: WorkbookCellReference; cell: CellMatrixElement | null }> {
  const changes: StructureChange[] = [];
  const updates: Array<{ reference: WorkbookCellReference; cell: CellMatrixElement | null }> = [];
  for (let index = operations.length - 1; index >= 0; index--) {
    const operation = operations[index];
    const change = matrixOperationToStructureChange(operation);
    if (change) changes.unshift(change);
    if (!isUpdateCellOperation<CellMatrixElement | null>(operation)) continue;
    const row = shiftStructureCoordinate({ coordinate: operation.p[0], axis: StructureChangeAxis.Row, changes });
    const col = shiftStructureCoordinate({ coordinate: operation.p[1], axis: StructureChangeAxis.Col, changes });
    if (row.deleted || col.deleted) continue;
    updates.push({ reference: { sheetId, row: row.value, col: col.value }, cell: operation.uc.value ?? null });
  }
  return updates.reverse();
}
