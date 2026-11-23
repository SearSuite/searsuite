import { type OTOperation } from './BaseOT';
import { MatrixOTActionName } from './MatrixOTActionName';
import { type MatrixOTOperationPath } from './MatrixOTOperationPath';

/** Deletes one column and carries the deleted column payload for inversion. */
export interface DeleteColOTOperation<T> extends OTOperation {
  p: MatrixOTOperationPath;
  [MatrixOTActionName.ColDelete]: (T | null)[];
}
