/**
 * Operational-transformation primitives for matrices, rectangles, and rich documents.
 *
 * @packageDocumentation
 */

import { MatrixOTActionName } from './MatrixOTActionName';
import { type MatrixOTOperation } from './MatrixOTOperation';
import { UpdateRectOTOperation, RectOTActionName } from './RectOT';
import { RichDocOTOperation, RichDocOTActionName } from './RichDocOT';

export { BaseOT, OTClone, OTTransformPriority, type OTOperation } from './BaseOT';

export { MatrixOT } from './MatrixOT';
export { MatrixOTActionName } from './MatrixOTActionName';
export { isMatrixStructureOperation } from './isMatrixStructureOperation';
export { isMatrixOperation } from './isMatrixOperation';
export { isResizeColOperation } from './isResizeColOperation';
export { isResizeRowOperation } from './isResizeRowOperation';
export { isUpdateCellOperation } from './isUpdateCellOperation';
export { createInsertRowOTOperation } from './createInsertRowOTOperation';
export { createInsertColOTOperation } from './createInsertColOTOperation';
export { createDeleteRowOTOperation } from './createDeleteRowOTOperation';
export { createDeleteColOTOperation } from './createDeleteColOTOperation';
export { createMoveRowOTOperation } from './createMoveRowOTOperation';
export { createMoveColOTOperation } from './createMoveColOTOperation';
export { createUpdateCellOTOperation } from './createUpdateCellOTOperation';
export { createResizeRowOTOperation } from './createResizeRowOTOperation';
export { createResizeColOTOperation } from './createResizeColOTOperation';
export { type MatrixOTOperation } from './MatrixOTOperation';
export { type MatrixStructureOTOperation } from './MatrixStructureOTOperation';
export { type InsertRowOTOperation } from './InsertRowOTOperation';
export { type InsertColOTOperation } from './InsertColOTOperation';
export { type DeleteRowOTOperation } from './DeleteRowOTOperation';
export { type DeleteColOTOperation } from './DeleteColOTOperation';
export { type MoveRowOTOperation } from './MoveRowOTOperation';
export { type MoveColOTOperation } from './MoveColOTOperation';
export { type UpdateCellOTOperation } from './UpdateCellOTOperation';
export { type ResizeRowOTOperation } from './ResizeRowOTOperation';
export { type ResizeColOTOperation } from './ResizeColOTOperation';
export { DenseMatrixOTSnapshot } from './DenseMatrixOTSnapshot';

export { RectOT, RectOTActionName, createUpdateRectOTOperation, type UpdateRectOTOperation } from './RectOT';

export {
  RichDocOT,
  RichDocOTActionName,
  type RichDocOTOperation,
  type RichDocOTOperationPath,
  type NodeSchema,
  type TextSchema,
  type InsertNodeOTOperation,
  type DeleteNodeOTOperation,
  type ReplaceNodeOTOperation,
  type MoveNodeOTOperation,
  type InsertStringOTOperation,
  type DeleteStringOTOperation,
  type UpdateAttrsOTOperation,
} from './RichDocOT';

/** Built-in operation union. Third-party callers use OTOperation as their open base contract. */
export type Operation = MatrixOTOperation<unknown> | UpdateRectOTOperation | RichDocOTOperation;

export {
  MatrixTransactionOT,
  MatrixTransactionOTRelation,
  RichDocTransactionOT,
  RichDocTransactionOTRelation,
  createBuiltinTransactionOTRegistry,
} from './BuiltinTransactionOT';
export { TransactionOTRegistry } from './TransactionOTRegistry';
export { TransactionOTError, TransactionOTErrorCode } from './TransactionOTError';
export {
  transactionOTTypeKey,
  type OTEncodedValue,
  type OTTransformPair,
  type OTTransformRelation,
  type TransactionOTDefinition,
} from './TransactionOTTypes';

/**
 * Returns a Set of all known OT action name strings.
 * Used by the engine to identify which action types are present in an operation.
 */
export function getAllActionNames(): Set<string> {
  const names: string[] = [
    ...Object.values(MatrixOTActionName),
    ...Object.values(RectOTActionName),
    ...Object.values(RichDocOTActionName),
  ];
  return new Set(names);
}
export { MatrixCellUpdateIntent } from './MatrixCellUpdateIntent';
