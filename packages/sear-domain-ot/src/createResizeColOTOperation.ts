import { MatrixOTActionName } from './MatrixOTActionName';
import { type ResizeColOTOperation } from './ResizeColOTOperation';

/** Creates a semantic column-resize operation. */
export function createResizeColOTOperation(
  path: readonly number[],
  value: number | null,
  previousValue: number | null,
): ResizeColOTOperation {
  return { p: [...path], [MatrixOTActionName.ResizeCol]: { value, prev: previousValue } };
}
