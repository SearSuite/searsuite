/**
 * MatrixActions - Operational Transformation Action Definitions
 *
 * This module defines the action types used in Operational Transformation (OT) for matrices.
 * OT is a technique for enabling real-time collaborative editing by allowing concurrent operations
 * to be applied and transformed consistently across all clients.
 *
 * Supported Actions:
 * - ListInsert: Insert a new element into a list/row
 * - ListDelete: Remove an element from a list/row
 * - ListReplace: Replace an element with a new value
 * - ListMove: Move an element to a different position
 *
 * Each action includes:
 * - Path specification (which element is affected)
 * - Operation details (what value or movement)
 *
 * These actions can be composed into operations and changesets for tracking matrix modifications
 * across a distributed system or for undo/redo functionality.
 *
 * @see InterfaceOperation for how actions are grouped
 * @see IChangeset for how operations are grouped with metadata
 */

/**
 * ListInsert Action - Represents insertion of a new element
 *
 * Used when a new value needs to be added at a specific position in a list/row.
 * The index is implicitly determined by the path.
 *
 * @template T - The type of element being inserted
 *
 * @property {T} li - The list insert value (the element to insert)
 */
export interface IListInsertAction<T> {
  // n: MatrixOTActionName.ListInsert;
  // p: InterfaceOTPath;
  /** The element value to insert */
  li: T;
}

/**
 * ListDelete Action - Represents removal of an existing element
 *
 * Used when a value needs to be removed from a list/row at a specific position.
 * Stores the deleted value for potential undo operations.
 *
 * @template T - The type of element being deleted
 *
 * @property {T} ld - The list delete value (the element that was removed)
 */
export interface IListDeleteAction<T> {
  // n: MatrixOTActionName.ListDelete;
  // p: InterfaceOTPath;
  /** The element value that was deleted */
  ld: T;
}

/**
 * ListReplace Action - Represents replacement of an existing element
 *
 * Used when a value at a specific position needs to be replaced with a new value.
 * Stores both old and new values for undo/redo capabilities.
 *
 * @template T - The type of element being replaced
 *
 * @property {T} ld - The old element value (being replaced)
 * @property {T} li - The new element value (replacement)
 */
export interface IListReplaceAction<T> {
  // n: MatrixOTActionName.ListReplace;
  // p: InterfaceOTPath;
  /** The element value being replaced */
  ld: T;
  /** The new element value */
  li: T;
}

/**
 * ListMove Action - Represents moving an element to a different position
 *
 * Used when an element at one index needs to be moved to another index within the same list/row.
 * This is useful for row/column reordering operations.
 *
 * @property {number} lm - The target index where the element should be moved to
 */
export interface IListMoveAction {
  // n: MatrixOTActionName.ListMove;
  // p: InterfaceOTPath;
  /** The target index to move the element to */
  lm: number;
}

/**
 * Union type representing any OT action that can be applied to a matrix element
 * @template T - The type of elements in the matrix
 */
export type InterfaceOTAction<T> =
  | IListInsertAction<T>
  | IListDeleteAction<T>
  | IListReplaceAction<T>
  | IListMoveAction;

/**
 * MatrixActions - Factory class for creating matrix OT actions
 *
 * Provides static methods to construct action objects for various matrix operations.
 * This allows consistent creation of action objects throughout the codebase.
 *
 * @example
 * const action = MatrixActions.addRowAction(3, 0);
 */
export class MatrixActions {
  /**
   * Creates an action for adding new rows to the matrix
   *
   * @param {number} numNewRows - The number of new rows to add
   * @param {number} targetIndex - The index where rows should be inserted
   * @returns {Object} An action object representing the row insertion
   *
   * @example
   * const action = MatrixActions.addRowAction(2, 5); // Add 2 rows at index 5
   */
  static addRowAction(numNewRows: number, targetIndex: number) {
    const action = {};
  }
}
