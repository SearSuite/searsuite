import { SearError } from '@searsuite/sear-foundation-error';
import { BaseOT, OTClone } from './BaseOT';
import { MatrixOTActionName } from './MatrixOTActionName';
import { type MatrixOTOperation } from './MatrixOTOperation';
import { type MatrixOTSnapshot } from './MatrixOTSnapshot';

/** Applies matrix OT operations to a mutable matrix snapshot. */
export function applyMatrixOperations<T, S extends MatrixOTSnapshot<T>>(
  snapshot: S,
  operations: MatrixOTOperation<T>[],
): S {
  BaseOT.checkValidOp(operations);
  const clonedOperations = OTClone(operations) as MatrixOTOperation<T>[];
  for (const operation of clonedOperations) {
    if (MatrixOTActionName.RowInsert in operation && operation.ri !== void 0)
      snapshot.addRow(operation.p[0], operation.ri);
    else if (MatrixOTActionName.RowDelete in operation && operation.rd !== void 0)
      snapshot.deleteRows(operation.p[0], 1);
    else if (MatrixOTActionName.RowMove in operation && operation.rm !== void 0)
      snapshot.swapRow(operation.p[0], operation.rm[0]);
    else if (MatrixOTActionName.ColInsert in operation && operation.ci !== void 0)
      snapshot.addColumn(operation.p[0], operation.ci);
    else if (MatrixOTActionName.ColDelete in operation && operation.cd !== void 0)
      snapshot.deleteColumns(operation.p[0], 1);
    else if (MatrixOTActionName.ColMove in operation && operation.cm !== void 0)
      snapshot.swapColumn(operation.p[0], operation.cm[0]);
    else if (MatrixOTActionName.UpdateCell in operation && operation.uc !== void 0) {
      if (operation.uc.value !== null) snapshot.addItem(operation.p[0], operation.p[1], operation.uc.value);
      else snapshot.removeItem(operation.p[0], operation.p[1]);
    } else if (MatrixOTActionName.ResizeRow in operation && operation.rr !== void 0) {
      if (operation.rr.value !== null) snapshot.addItem(0, operation.p[0], operation.rr.value as T);
      else snapshot.removeItem(0, operation.p[0]);
    } else if (MatrixOTActionName.ResizeCol in operation && operation.rc !== void 0) {
      if (operation.rc.value !== null) snapshot.addItem(0, operation.p[0], operation.rc.value as T);
      else snapshot.removeItem(0, operation.p[0]);
    } else throw new SearError('invalid / missing instruction in op');
  }
  return snapshot;
}
