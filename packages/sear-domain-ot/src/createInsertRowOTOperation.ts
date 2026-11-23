import { MatrixOTActionName } from './MatrixOTActionName';
import { type InsertRowOTOperation } from './InsertRowOTOperation';

/** Creates a semantic row-insert operation without changing the MatrixOT wire shape. */
export function createInsertRowOTOperation<T>(
  path: readonly number[],
  values: readonly (T | null)[],
): InsertRowOTOperation<T> {
  return { p: [...path], [MatrixOTActionName.RowInsert]: [...values] };
}
