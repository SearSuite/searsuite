import { type InsertColOTOperation } from './InsertColOTOperation';
import { MatrixOTActionName } from './MatrixOTActionName';

/** Creates a semantic column-insert operation without changing the MatrixOT wire shape. */
export function createInsertColOTOperation<T>(
  path: readonly number[],
  values: readonly (T | null)[],
): InsertColOTOperation<T> {
  return { p: [...path], [MatrixOTActionName.ColInsert]: [...values] };
}
