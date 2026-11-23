import { type OTOperation } from './BaseOT';
import { MatrixOTActionName } from './MatrixOTActionName';
import { type UpdateCellOTOperation } from './UpdateCellOTOperation';

/** Narrows an OT operation to an update-cell operation with a present action payload. */
export function isUpdateCellOperation<T>(operation: OTOperation): operation is UpdateCellOTOperation<T> {
  return MatrixOTActionName.UpdateCell in operation && operation.uc !== void 0;
}
