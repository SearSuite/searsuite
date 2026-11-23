import { type DeleteColOTOperation } from './DeleteColOTOperation';
import { type DeleteRowOTOperation } from './DeleteRowOTOperation';
import { type InsertColOTOperation } from './InsertColOTOperation';
import { type InsertRowOTOperation } from './InsertRowOTOperation';
import { type MoveColOTOperation } from './MoveColOTOperation';
import { type MoveRowOTOperation } from './MoveRowOTOperation';
import { type ResizeColOTOperation } from './ResizeColOTOperation';
import { type ResizeRowOTOperation } from './ResizeRowOTOperation';
import { type UpdateCellOTOperation } from './UpdateCellOTOperation';

/** Every operation understood by MatrixOT and matrix-backed sheet state. */
export type MatrixOTOperation<T> =
  | InsertRowOTOperation<T>
  | DeleteRowOTOperation<T>
  | UpdateCellOTOperation<T>
  | MoveRowOTOperation<T>
  | InsertColOTOperation<T>
  | DeleteColOTOperation<T>
  | MoveColOTOperation<T>
  | ResizeRowOTOperation
  | ResizeColOTOperation;
