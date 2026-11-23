import { type OTOperation } from './BaseOT';
import { MatrixOTActionName } from './MatrixOTActionName';
import { type MatrixOTOperationPath } from './MatrixOTOperationPath';

/** Updates one row dimension in a dimension matrix. */
export interface ResizeRowOTOperation extends OTOperation {
  p: MatrixOTOperationPath;
  [MatrixOTActionName.ResizeRow]: { value: number | null; prev: number | null };
}
