import { MatrixOTActionName } from './MatrixOTActionName';
import { type MoveColOTOperation } from './MoveColOTOperation';

/** Creates a semantic column-move operation. */
export function createMoveColOTOperation(
  path: readonly number[],
  destination: readonly number[],
): MoveColOTOperation<unknown> {
  return { p: [...path], [MatrixOTActionName.ColMove]: [...destination] };
}
