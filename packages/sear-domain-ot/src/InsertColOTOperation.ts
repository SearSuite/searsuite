import { type OTOperation } from './BaseOT';
import { MatrixOTActionName } from './MatrixOTActionName';
import { type MatrixOTOperationPath } from './MatrixOTOperationPath';

/** Inserts one column at the target column index. */
export interface InsertColOTOperation<T> extends OTOperation {
  p: MatrixOTOperationPath;
  [MatrixOTActionName.ColInsert]: (T | null)[];
}
