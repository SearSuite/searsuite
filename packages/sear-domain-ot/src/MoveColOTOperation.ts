import { type OTOperation } from './BaseOT';
import { MatrixOTActionName } from './MatrixOTActionName';
import { type MatrixOTOperationPath } from './MatrixOTOperationPath';

/** Exchanges the column at the path index with the column index encoded by cm. */
export interface MoveColOTOperation<T> extends OTOperation {
  p: MatrixOTOperationPath;
  [MatrixOTActionName.ColMove]: MatrixOTOperationPath;
}
