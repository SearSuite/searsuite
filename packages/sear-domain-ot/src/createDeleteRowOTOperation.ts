import { type DeleteRowOTOperation } from './DeleteRowOTOperation';
import { MatrixOTActionName } from './MatrixOTActionName';

/** Creates a semantic row-delete operation carrying the deleted values required for inversion. */
export function createDeleteRowOTOperation<T>(
  path: readonly number[],
  values: readonly (T | null)[],
): DeleteRowOTOperation<T> {
  return { p: [...path], [MatrixOTActionName.RowDelete]: [...values] };
}
