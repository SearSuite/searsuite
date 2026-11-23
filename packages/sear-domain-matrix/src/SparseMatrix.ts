import { SearError } from '@searsuite/sear-foundation-error';
import { SearState } from '@searsuite/sear-domain-state';
import { OTOperation } from '@searsuite/sear-domain-ot';

/**
 * SparseMatrix - Abstract Base Class for Sparse Matrix Data Structures
 *
 * An abstract class that defines the interface and common functionality for sparse matrix implementations.
 * A sparse matrix is a matrix where most elements are zero/empty, and only non-zero elements are stored,
 * resulting in significant memory savings for sparse data.
 *
 * Core Responsibilities:
 * - Define the interface for matrix operations (getItem, forEach, etc.)
 * - Manage matrix dimensions (rows and columns)
 * - Provide change notification through SearState
 * - Track and dispatch operational transformation operations
 *
 * Key Concepts:
 * - The matrix is 2-dimensional (ndim = 2)
 * - Elements can be retrieved, set, and removed
 * - Element access returns null for missing values or the default value if set
 * - Matrices are observable (changes trigger notifications)
 *
 * Concrete implementations (e.g., CSRMatrix) should override abstract methods
 * and optimize storage for their specific sparse structure.
 *
 * @template T - The type of elements stored in the matrix (e.g., number, string, object)
 * @extends SearState<T> - Provides observable state management and change notifications
 *
 * @example
 * // Direct instantiation is not possible since this is abstract
 * // Use CSRMatrix or another concrete implementation:
 * const matrix = new CSRMatrix<number>({}, [10, 10]);
 */
export abstract class SparseMatrix<T> extends SearState<T> {
  /**
   * Identifier for this matrix instance.
   * Default value is 'SparseMatrix', but implementations should override this.
   * Used for state management and debugging.
   */
  public readonly name: string = 'SparseMatrix';

  /**
   * Number of dimensions in the matrix.
   * For a standard sparse matrix, this is always 2 (rows and columns).
   * Kept as a property for potential future extensions (e.g., 3D arrays).
   */
  public readonly ndim: number = 2;

  /**
   * Default value returned for unset/missing elements.
   * If not set (undefined), null is returned for missing elements.
   * Allows treating sparse matrices with a consistent fallback value.
   */
  protected defaultValue: T | undefined = void 0;

  /**
   * Number of rows in the matrix.
   * Must be non-negative and updated when rows are added or removed.
   */
  protected numRows = 0;

  /**
   * Number of columns in the matrix.
   * Must be non-negative and updated when columns are added or removed.
   */
  protected numCols = 0;

  /**
   * Initializes a new instance of the SparseMatrix class.
   *
   * @param {number} numRows - The initial number of rows (defaults to 0)
   * @param {number} numCols - The initial number of columns (defaults to 0)
   *
   * @example
   * // Create a 5x10 matrix
   * const matrix = new CSRMatrix(5, 10);
   */
  constructor(numRows: number = 0, numCols: number = 0) {
    super();
    this.numRows = numRows;
    this.numCols = numCols;
  }

  /**
   * Gets the shape (dimensions) of the matrix as a tuple [rows, columns].
   *
   * @returns {[number, number]} A tuple containing [numRows, numCols]
   *
   * @example
   * const [rows, cols] = matrix.shape;
   * console.log(`Matrix is ${rows}x${cols}`);
   */
  get shape() {
    return [this.numRows, this.numCols];
  }

  /**
   * Validates that the given row and column indices are within matrix bounds.
   *
   * Throws an error if either index is negative or >= its corresponding dimension.
   * This is a defensive programming practice used throughout the matrix operations.
   *
   * @param {number} row - The row index to validate
   * @param {number} col - The column index to validate
   * @throws {Error} Throws 'Index out of bounds' if validation fails
   *
   * @protected
   */
  protected isOutOfBounds(row: number, col: number) {
    if (row < 0 || row >= this.numRows || col < 0 || col >= this.numCols) throw new SearError('Index out of bounds');
  }

  /**
   * Validates that the given row and column indices are valid (non-negative).
   *
   * Allows indices beyond current bounds (useful for expanding the matrix on insertion).
   * Only checks that indices are not negative.
   *
   * @param {number} row - The row index to validate
   * @param {number} col - The column index to validate
   * @throws {Error} Throws if row or column is negative
   *
   * @protected
   */
  protected isVaildPosition(row: number, col: number) {
    if (row < 0) throw new SearError(`Invalid row index ${row}`);
    if (col < 0) throw new SearError(`Invalid col index ${col}`);
  }

  /**
   * Sets the default value that will be returned for missing/unset elements.
   *
   * By default, getItem returns null for missing values. If a default value is set,
   * missing values will return this default instead of null.
   *
   * @param {T} value - The default value to return for missing elements
   *
   * @example
   * matrix.setDefaultValue(0); // Return 0 for missing cells
   * const value = matrix.getItem(5, 5); // Returns 0 if not set
   */
  public setDefaultValue(value: T) {
    this.assertMutable();
    this.defaultValue = value;
  }

  /** Stateful implementations override this when committed instances reject writes. */
  protected assertMutable(): void {}

  /** Returns the configured fallback used for absent sparse entries, if one exists. */
  public getDefaultValue(): T | undefined {
    return this.defaultValue;
  }

  /**
   * Iterates over every element in the matrix and applies a callback function.
   *
   * This method iterates through all rows and columns, calling the callback for each position.
   * For a sparse matrix, this might iterate many times over empty/null values.
   * Consider using specialized iterators for better performance on large sparse matrices.
   *
   * @param {(value: T | null, row: number, col: number) => void} callback - The function to execute for each element
   *                                                                          - value: The element at [row, col]
   *                                                                          - row: The row index
   *                                                                          - col: The column index
   *
   * Time Complexity: O(rows * cols)
   *
   * @example
   * let sum = 0;
   * matrix.forEach((value, row, col) => {
   *   if (value !== null) sum += value;
   * });
   */
  public forEach(callback: (value: T | null, row: number, col: number) => void) {
    for (let i = 0; i < this.numRows; i++) {
      for (let j = 0; j < this.numCols; j++) {
        const value = this.getItem(i, j);
        callback(value, i, j);
      }
    }
  }

  /**
   * Iterates only values physically stored by the sparse matrix.
   *
   * Unlike {@link forEach}, this must not visit implicit empty cells or a
   * configured default value. Sparse implementations should override it so
   * startup indexes can be built without probing every column, rather than
   * O(rows × columns).
   */
  public forEachStored(callback: (value: T, row: number, col: number) => void): void {
    this.forEach((value, row, col) => {
      if (value !== null) callback(value, row, col);
    });
  }

  /** Iterates stored values in one row. Sparse implementations should override this. */
  public forEachStoredInRow(row: number, callback: (value: T, col: number) => void): void {
    for (let col = 0; col < this.numCols; col++) {
      const value = this.getItem(row, col);
      if (value !== null) callback(value, col);
    }
  }

  /**
   * Applies a set of operational transformation (OT) operations to the matrix.
   *
   * This is used for collaborative editing or undo/redo mechanisms.
   * The base implementation does nothing; subclasses should override to handle operations.
   *
   * @param {OTOperation[]} operations - Array of OT operations to apply
   * @returns {this} The matrix instance for method chaining
   *
   * @example
   * const ops = [{ cmd: 'insert_row', ... }];
   * matrix.dispatch(ops);
   */
  public dispatch(operations: OTOperation[]) {
    return this;
  }

  /**
   * Converts the sparse matrix to a dense 2D array representation.
   *
   * The resulting array includes all elements (including null/empty values).
   * This is useful for serialization, debugging, or interfacing with code that expects dense arrays.
   *
   * Warning: For very large matrices with few non-zero elements, this can consume significant memory.
   *
   * @abstract - Must be implemented by subclasses
   * @returns {T[][]} A 2D array representation of the matrix
   *
   * Time Complexity: O(rows * cols) - must create all elements
   */
  abstract toArray(): T[][];

  /**
   * Retrieves a specific element from the matrix at the given position.
   *
   * Abstract method - must be implemented by subclasses.
   * Should return null or the default value if no element is stored at that position.
   *
   * @abstract
   * @param {number} row - The row index
   * @param {number} col - The column index
   * @returns {(T | null)} The element at the specified position
   *
   * @throws {Error} If indices are out of bounds (implementation-dependent)
   */
  public getItem(row: number, col: number): T | null {
    throw new SearError('SparseMatrix.getItem must be implemented by subclasses.');
  }

  /**
   * Retrieves a specific row from the matrix.
   *
   * Abstract method - must be implemented by subclasses for efficiency.
   * A naive implementation would use getItem for each column, but sparse implementations
   * can optimize this significantly.
   *
   * @abstract
   * @param {number} rowIndex - The index of the row to retrieve
   * @returns {T[]} The row as an array
   * @throws {Error} Unless a subclass provides row lookup.
   */
  getRow(rowIndex: number) {
    throw new SearError('SparseMatrix.getRow must be implemented by subclasses.');
  }

  /**
   * Retrieves a specific column from the matrix.
   *
   * Abstract method - must be implemented by subclasses for efficiency.
   * Similar to getRow but returns a single column instead.
   *
   * @abstract
   * @param {number} colIndex - The index of the column to retrieve
   * @returns {T[]} The column as an array
   * @throws {Error} Unless a subclass provides column lookup.
   */
  getCol(colIndex: number) {
    throw new SearError('SparseMatrix.getCol must be implemented by subclasses.');
  }

  /**
   * Computes the dot product with another sparse matrix.
   *
   * The dot product (scalar product) of two matrices is a standard linear algebra operation.
   * For efficiency, implementations should take advantage of the sparse structure.
   *
   * @abstract
   * @template U - The type of elements in the other matrix
   * @param {SparseMatrix<U>} other - The other matrix to compute the dot product with
   * @returns {SparseMatrix<U>} The resulting matrix from the dot product
   * @throws {Error} Unless a subclass provides dot-product semantics.
   */
  dot<U>(other: SparseMatrix<U>) {
    throw new SearError('SparseMatrix.dot must be implemented by subclasses.');
  }

  /**
   * Multiplies this matrix with another sparse matrix (matrix multiplication).
   *
   * Standard matrix multiplication: result[i][j] = sum(this[i][k] * other[k][j])
   * For efficiency, implementations should take advantage of the sparse structure.
   *
   * @abstract
   * @template U - The type of elements in the other matrix
   * @param {SparseMatrix<U>} other - The matrix to multiply with
   * @returns {SparseMatrix<U>} The resulting matrix from the multiplication
   * @throws {Error} Unless a subclass provides multiplication semantics.
   */
  multiply<U>(other: SparseMatrix<U>) {
    throw new SearError('SparseMatrix.multiply must be implemented by subclasses.');
  }

  /**
   * Transposes the matrix (swaps rows and columns).
   *
   * The transpose operation creates a new matrix where rows become columns and vice versa.
   * Sparse structure should be preserved in the result.
   *
   * @abstract
   * @returns {SparseMatrix<T>} The transposed matrix
   * @throws {Error} Unless a subclass provides transpose semantics.
   */
  transpose() {
    throw new SearError('SparseMatrix.transpose must be implemented by subclasses.');
  }

  /**
   * Sums the elements of the matrix along the specified axis.
   *
   * @abstract
   * @param {null | 0 | 1} axis - The axis to sum along:
   *                              - null: Sum all elements (single value)
   *                              - 0: Sum along rows (column sums, returns row vector)
   *                              - 1: Sum along columns (row sums, returns column vector)
   * @returns {T} The sum result (varies based on axis parameter)
   * @throws {Error} Unless a subclass provides summation semantics.
   */
  sum(axis: null | 0 | 1) {
    throw new SearError('SparseMatrix.sum must be implemented by subclasses.');
  }

  /**
   * Gets the number of non-zero elements in the matrix.
   *
   * For sparse matrices, this is significantly more efficient than counting all elements.
   * Useful for analyzing matrix sparsity and choosing appropriate algorithms.
   *
   * @abstract
   * @returns {number} The count of non-zero elements
   * @throws {Error} Unless a subclass provides sparse non-zero counting.
   *
   * @example
   * const nonZeroCount = matrix.nnz;
   * const sparsity = 1 - (nonZeroCount / (matrix.shape[0] * matrix.shape[1]));
   */
  get nnz() {
    throw new SearError('SparseMatrix.nnz must be implemented by subclasses.');
  }
}
