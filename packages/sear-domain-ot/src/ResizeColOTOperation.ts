import { type OTOperation } from './BaseOT';
import { MatrixOTActionName } from './MatrixOTActionName';
import { type MatrixOTOperationPath } from './MatrixOTOperationPath';

/** Updates one column dimension in a dimension matrix. */
export interface ResizeColOTOperation extends OTOperation {
  p: MatrixOTOperationPath;
  [MatrixOTActionName.ResizeCol]: { value: number | null; prev: number | null };
}
