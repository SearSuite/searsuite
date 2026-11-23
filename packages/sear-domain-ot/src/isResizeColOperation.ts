import { type OTOperation } from './BaseOT';
import { MatrixOTActionName } from './MatrixOTActionName';
import { type ResizeColOTOperation } from './ResizeColOTOperation';

/** Narrows an OT operation to a column-resize operation with a present action payload. */
export function isResizeColOperation(operation: OTOperation): operation is ResizeColOTOperation {
  return MatrixOTActionName.ResizeCol in operation && operation.rc !== void 0;
}
