import { type OTOperation } from './BaseOT';
import { MatrixOTActionName } from './MatrixOTActionName';
import { type MatrixStructureOTOperation } from './MatrixStructureOTOperation';

/** Narrows an OT operation to one of the row or column structure operations. */
export function isMatrixStructureOperation<T>(operation: OTOperation): operation is MatrixStructureOTOperation<T> {
  return (
    (MatrixOTActionName.RowInsert in operation && operation.ri !== void 0) ||
    (MatrixOTActionName.RowDelete in operation && operation.rd !== void 0) ||
    (MatrixOTActionName.RowMove in operation && operation.rm !== void 0) ||
    (MatrixOTActionName.ColInsert in operation && operation.ci !== void 0) ||
    (MatrixOTActionName.ColDelete in operation && operation.cd !== void 0) ||
    (MatrixOTActionName.ColMove in operation && operation.cm !== void 0)
  );
}
