import { type DeleteColOTOperation } from './DeleteColOTOperation';
import { type DeleteRowOTOperation } from './DeleteRowOTOperation';
import { type InsertColOTOperation } from './InsertColOTOperation';
import { type InsertRowOTOperation } from './InsertRowOTOperation';
import { type MoveColOTOperation } from './MoveColOTOperation';
import { type MoveRowOTOperation } from './MoveRowOTOperation';

/** Structural matrix operations that shift row or column coordinates. */
export type MatrixStructureOTOperation<T> =
  | InsertRowOTOperation<T>
  | DeleteRowOTOperation<T>
  | MoveRowOTOperation<T>
  | InsertColOTOperation<T>
  | DeleteColOTOperation<T>
  | MoveColOTOperation<T>;
