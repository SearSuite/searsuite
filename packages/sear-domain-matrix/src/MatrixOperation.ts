import { InterfaceOTAction } from './MatrixActions';

/**
 * MatrixOperation - Represents a single matrix transformation operation
 *
 * An operation is a collection of one or more actions that together represent
 * a logical change to the matrix. Multiple operations can be composed into a changeset.
 *
 * @template T - The type of elements affected by these actions
 *
 * @property {string} cmd - Command identifier indicating the type of operation
 *                         (e.g., 'insert_rows', 'delete_columns', etc.)
 * @property {InterfaceOTAction<T>[]} actions - Array of atomic actions that make up this operation
 * @property {number} revision - Optional version/revision number for tracking which version
 *                              this operation was based on (useful for conflict resolution)
 *
 * @example
 * const operation: InterfaceOperation<number> = {
 *   cmd: 'insert_rows',
 *   actions: [
 *     { li: 30 },    // Insert row height 30
 *     { li: 25 }     // Insert row height 25
 *   ],
 *   revision: 5
 * };
 */
export interface InterfaceOperation<T> {
  /**
   * Command identifier describing the operation type.
   * Examples: 'insert_rows', 'delete_columns', 'update_values', etc.
   */
  cmd: string;

  /**
   * Array of atomic actions composing this operation.
   * All actions are typically applied together as part of the same logical change.
   */
  actions: InterfaceOTAction<T>[];

  /**
   * Optional revision number indicating the matrix version this operation was based on.
   * Useful for operational transformation and conflict detection.
   */
  revision?: number;
}

/**
 * IChangeset - Represents a set of operations applied to a specific matrix
 *
 * A changeset groups multiple operations with metadata about the change source and target.
 * This is useful for:
 * - Tracking changes in collaborative environments
 * - Undo/redo stacks
 * - Change history and audit trails
 * - Replicating changes to other instances
 *
 * @template T - The type of elements affected by the operations in this changeset
 *
 * @property {string} messageId - Unique identifier for this changeset (typically a UUID)
 * @property {string} resourceId - Identifier of the matrix/resource being modified
 * @property {InterfaceOperation<T>[]} operations - Array of operations in this changeset
 *
 * @example
 * const changeset: IChangeset<number> = {
 *   messageId: 'msg-123456',
 *   resourceId: 'matrix-1',
 *   operations: [
 *     { cmd: 'insert_rows', actions: [{ li: 30 }], revision: 5 },
 *     { cmd: 'update_values', actions: [{ ld: 0, li: 100 }], revision: 6 }
 *   ]
 * };
 */
export interface IChangeset<T> {
  /**
   * Unique message identifier for this changeset.
   * Typically a UUID, used to prevent duplicate processing.
   */
  messageId: string;

  /**
   * The identifier of the matrix or resource that this changeset applies to.
   * Allows distinguishing changes for different matrices in a system.
   */
  resourceId: string;

  /**
   * Array of operations that comprise this changeset.
   * Operations are typically applied in order.
   */
  operations: InterfaceOperation<T>[];
}
