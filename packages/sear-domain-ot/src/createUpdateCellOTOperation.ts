import { MatrixOTActionName } from './MatrixOTActionName';
import { type UpdateCellOTOperation } from './UpdateCellOTOperation';
import { type MatrixCellUpdateIntent } from './MatrixCellUpdateIntent';

/** Creates a semantic cell-update operation carrying both values required for inversion. */
export function createUpdateCellOTOperation<T>(
  path: readonly number[],
  value: T | null,
  previousValue: T | null,
  intent?: MatrixCellUpdateIntent,
): UpdateCellOTOperation<T> {
  return {
    p: [...path],
    [MatrixOTActionName.UpdateCell]: { value, prev: previousValue, ...(intent ? { intent } : {}) },
  };
}
