import { type OTOperation } from './BaseOT';
import { MatrixOTActionName } from './MatrixOTActionName';
import { type MatrixOTOperation } from './MatrixOTOperation';

/** Narrows an operation to any operation understood by MatrixOT. */
export function isMatrixOperation(operation: OTOperation): operation is MatrixOTOperation<unknown> {
  return Object.values(MatrixOTActionName).some((action) => action in operation);
}
