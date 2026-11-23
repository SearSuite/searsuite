import { type OTOperation } from './BaseOT';
import { MatrixOTActionName } from './MatrixOTActionName';
import { type ResizeRowOTOperation } from './ResizeRowOTOperation';

/** Narrows an OT operation to a row-resize operation with a present action payload. */
export function isResizeRowOperation(operation: OTOperation): operation is ResizeRowOTOperation {
  return MatrixOTActionName.ResizeRow in operation && operation.rr !== void 0;
}
