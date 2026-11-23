import { MatrixOTActionName } from './MatrixOTActionName';
import { type ResizeRowOTOperation } from './ResizeRowOTOperation';

/** Creates a semantic row-resize operation. */
export function createResizeRowOTOperation(
  path: readonly number[],
  value: number | null,
  previousValue: number | null,
): ResizeRowOTOperation {
  return { p: [...path], [MatrixOTActionName.ResizeRow]: { value, prev: previousValue } };
}
