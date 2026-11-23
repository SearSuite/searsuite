import { MatrixOTActionName } from './MatrixOTActionName';
import { type MoveRowOTOperation } from './MoveRowOTOperation';

/** Creates a semantic row-move operation. */
export function createMoveRowOTOperation(
  path: readonly number[],
  destination: readonly number[],
): MoveRowOTOperation<unknown> {
  return { p: [...path], [MatrixOTActionName.RowMove]: [...destination] };
}
