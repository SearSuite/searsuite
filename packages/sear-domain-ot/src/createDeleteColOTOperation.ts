import { type DeleteColOTOperation } from './DeleteColOTOperation';
import { MatrixOTActionName } from './MatrixOTActionName';

/** Creates a semantic column-delete operation carrying the deleted values required for inversion. */
export function createDeleteColOTOperation<T>(
  path: readonly number[],
  values: readonly (T | null)[],
): DeleteColOTOperation<T> {
  return { p: [...path], [MatrixOTActionName.ColDelete]: [...values] };
}
