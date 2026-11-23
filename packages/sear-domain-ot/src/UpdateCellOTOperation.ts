import { type OTOperation } from './BaseOT';
import { MatrixOTActionName } from './MatrixOTActionName';
import { type MatrixOTOperationPath } from './MatrixOTOperationPath';
import { type MatrixCellUpdateIntent } from './MatrixCellUpdateIntent';

/** Updates a single cell and carries both forward and previous values. */
export interface UpdateCellOTOperation<T> extends OTOperation {
  p: MatrixOTOperationPath;
  [MatrixOTActionName.UpdateCell]: { value: T | null; prev: T | null; intent?: MatrixCellUpdateIntent };
}
