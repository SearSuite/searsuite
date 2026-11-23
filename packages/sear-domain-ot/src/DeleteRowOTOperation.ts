import { type OTOperation } from './BaseOT';
import { MatrixOTActionName } from './MatrixOTActionName';
import { type MatrixOTOperationPath } from './MatrixOTOperationPath';

/** Deletes one row and carries the deleted row payload for inversion. */
export interface DeleteRowOTOperation<T> extends OTOperation {
  p: MatrixOTOperationPath;
  [MatrixOTActionName.RowDelete]: (T | null)[];
}
