import { SearError } from '@searsuite/sear-foundation-error';
import { SparseMatrix } from './SparseMatrix';
import { MatrixOT, MatrixOTOperation } from '@searsuite/sear-domain-ot';
import { BuildInStateName } from '@searsuite/sear-foundation-common';

/**
 * Sparse two-dimensional storage for Sheet values.
 *
 * A row pointer identifies each row's stored entries, so empty cells do not
 * occupy a value slot. `getItem` returns the configured default or `null` for
 * an absent entry. Use `forEachStored` when a reader needs only populated
 * cells rather than visiting every coordinate in a large Sheet.
 *
 * Committed matrices can be locked against direct writes. Transaction staging
 * works on a separate mutable copy and replaces the committed value afterward.
 * @template T - The type of elements stored in the matrix.
 * @extends SparseMatrix<T>
 */
export class CSRMatrix<T> extends SparseMatrix<T> {
  /** The name of the matrix state. */
  public name: string = BuildInStateName.CORE_STATE;

  /** The non-zero data elements of the matrix. */
  protected data: T[] = [];
  /** The column indices of the non-zero data elements. */
  protected indices: number[] = [0];
  /** The index pointer to the start of each row in the data array. */
  protected indptr: number[] = [];

  /** Prevents writes to a committed matrix while leaving clones mutable for transaction staging. */
  public lockMutations(): void {
    if (lockedMatrices.has(this)) return;
    this.data = Array.from(this.data);
    this.indices = Array.from(this.indices);
    this.indptr = Array.from(this.indptr);
    validateSparseStorage(this.indices, 'indices');
    validateSparseStorage(this.indptr, 'indptr');
    if (!Number.isSafeInteger(this.numRows) || this.numRows < 0 ||
      !Number.isSafeInteger(this.numCols) || this.numCols < 0) {
      throw new SearError('Committed matrix dimensions must be non-negative integers.');
    }
    if (typeof this.name !== 'string' || this.ndim !== 2) {
      throw new SearError('Committed matrix metadata must have a string name and two dimensions.');
    }
    const seen = new WeakSet<object>();
    const snapshots = new WeakMap<object, unknown>();
    const visiting = new WeakSet<object>();
    this.data.forEach((value, index) => {
      if (value !== null && typeof value === 'object' && adoptedStoredValues.has(value)) return;
      freezeStoredValue(value, seen);
      const snapshot = snapshotStoredValue(value, snapshots, visiting);
      if (snapshot !== value) this.data[index] = snapshot;
    });
    if (this.defaultValue === null || typeof this.defaultValue !== 'object' ||
      !adoptedStoredValues.has(this.defaultValue)) {
      freezeStoredValue(this.defaultValue, seen);
      if (this.defaultValue !== void 0) {
        this.defaultValue = snapshotStoredValue(this.defaultValue, snapshots, visiting);
      }
    }
    Object.freeze(this.data);
    Object.freeze(this.indices);
    Object.freeze(this.indptr);
    for (const key of ['data', 'indices', 'indptr', 'numRows', 'numCols', 'defaultValue', 'name', 'ndim'] as const) {
      Object.defineProperty(this, key, { writable: false, configurable: false });
    }
    Object.preventExtensions(this);
    lockedMatrices.add(this);
  }

  protected assertMutable(): void {
    if (lockedMatrices.has(this)) throw new SearError('Committed matrix state can only change through a command transaction.');
  }

  /**
   * Constructs a CSRMatrix instance.
   * @param {Object} data - The data for the matrix.
   * @param {T[]} data.data - The non-zero data elements.
   * @param {number[]} data.indices - The column indices of the non-zero data elements.
   * @param {number[]} data.indptr - The index pointer to the start of each row in the data array.
   * @param {[number, number]} shape - The shape of the matrix as [numRows, numCols].
   */
  constructor(
    data: {
      data: T[];
      indices: number[];
      indptr: number[];
    } = {
      data: [],
      indices: [0],
      indptr: [],
    },
    shape: [number, number] = [0, 0],
  ) {
    super(shape[0], shape[1]);
    this.data = data.data;
    // A CSR row-pointer array has one entry more than the row count.  Empty
    // matrices commonly use the default `[0]` pointer; extend it to the
    // declared shape so later addItem() calls can update every row.
    this.indices = [...data.indices];
    const lastPointer = this.indices.at(-1) ?? 0;
    while (this.indices.length < this.numRows + 1) {
      this.indices.push(lastPointer);
    }
    this.indptr = data.indptr;
  }

  /** Creates an independent copy of this value and its mutable data. */
  public clone(): this {
    const MatrixConstructor = this.constructor as new () => this;
    const clone = new MatrixConstructor();
    clone.numRows = this.numRows;
    clone.numCols = this.numCols;
    clone.data = [...this.data];
    clone.indices = [...this.indices];
    clone.indptr = [...this.indptr];
    clone.defaultValue = this.defaultValue;
    return clone;
  }

  /** Copies visible sparse state without invoking subclass constructors or clone hooks. */
  public cloneForStaging(cloneValue: <Value>(value: Value) => Value = (value) => value): this {
    const copy = Object.create(Object.getPrototypeOf(this)) as this;
    for (const key of Reflect.ownKeys(this)) {
      const descriptor = Object.getOwnPropertyDescriptor(this, key);
      if (!descriptor) continue;
      if (!('value' in descriptor)) throw new SearError('Matrix state cannot contain accessors.');
      let value: unknown;
      if (key === 'data') value = this.data.map(cloneValue);
      else if (key === 'indices') value = [...this.indices];
      else if (key === 'indptr') value = [...this.indptr];
      else if (key === 'listeners') value = [];
      else value = cloneValue(descriptor.value);
      Object.defineProperty(copy, key, { ...descriptor, value, writable: true, configurable: true });
    }
    return copy;
  }

  /** Detaches subclass-private slots while sharing already frozen sparse storage. */
  public cloneCommittedView(detachExtra?: (value: unknown) => unknown): this {
    if (!lockedMatrices.has(this) || !Object.isFrozen(this.data) ||
      !Object.isFrozen(this.indices) || !Object.isFrozen(this.indptr)) {
      throw new SearError('A committed matrix view requires locked sparse storage.');
    }
    const copy = Object.create(Object.getPrototypeOf(this)) as this;
    for (const key of Reflect.ownKeys(this)) {
      const descriptor = Object.getOwnPropertyDescriptor(this, key);
      if (!descriptor) continue;
      if (!('value' in descriptor)) throw new SearError('Matrix state cannot contain accessors.');
      Object.defineProperty(copy, key, {
        ...descriptor,
        value: key === 'listeners' ? [] :
          detachExtra && !csrRuntimeFields.has(key) ? detachExtra(descriptor.value) : descriptor.value,
      });
    }
    Object.preventExtensions(copy);
    lockedMatrices.add(copy);
    return copy;
  }

  /** Copies stored values for a detached snapshot without probing empty cells. */
  public cloneDetached(cloneValue: (value: T) => T): this {
    const copy = this.clone();
    copy.data = copy.data.map(cloneValue);
    if (copy.defaultValue !== void 0) copy.defaultValue = cloneValue(copy.defaultValue);
    return copy;
  }

  /**
   * Converts a dense array to a CSRMatrix.
   * @param {(T | null)[][]} denseArray - The dense array to convert.
   * @returns {CSRMatrix<T>} The current instance for chaining.
   */
  public fromDense(denseArray: (T | null)[][]) {
    this.assertMutable();
    this.numRows = denseArray.length;
    this.numCols = denseArray[0].length;

    denseArray.forEach((row, i) => {
      row.forEach((value, j) => {
        if (value) this.data.push(value), this.indptr.push(j);
      });
      this.indices.push(this.data.length);
    });

    this.notifyListeners();
    return this;
  }

  /**
   * Retrieves an item from the matrix at the specified row and column.
   * @param {number} row - The row index.
   * @param {number} col - The column index.
   * @returns {(T | null)} The item at the specified position or null if not present.
   */
  public override getItem(row: number, col: number): T | null {
    this.isOutOfBounds(row, col);

    for (let j = this.indices[row]; j < this.indices[row + 1]; j++) {
      if (this.indptr[j] === col) return this.data[j];
    }
    return this.defaultValue === void 0 ? null : this.defaultValue;
  }

  /**
   * Visits the entries encoded in CSR storage without probing empty cells.
   *
   * This is the appropriate traversal for startup indexes and import-time
   * processors. Its complexity is O(rows + number of stored entries), instead
   * of O(rows × columns).
   */
  public override forEachStored(callback: (value: T, row: number, col: number) => void): void {
    for (let row = 0; row < this.numRows; row++) {
      for (let index = this.indices[row]; index < this.indices[row + 1]; index++) {
        callback(this.data[index], row, this.indptr[index]);
      }
    }
  }

  /** Visits the CSR segment for one row in O(stored entries in that row). */
  public override forEachStoredInRow(row: number, callback: (value: T, col: number) => void): void {
    if (row < 0 || row >= this.numRows) throw new SearError('Index out of bounds');

    for (let index = this.indices[row]; index < this.indices[row + 1]; index++) {
      callback(this.data[index], this.indptr[index]);
    }
  }

  /** Visits stored entries in an inclusive rectangle, skipping empty CSR rows and out-of-range columns. */
  public forEachStoredInRange(
    startRow: number, startColumn: number, endRow: number, endColumn: number,
    callback: (value: T, row: number, column: number) => void,
  ): void {
    if (startRow < 0 || startColumn < 0 || endRow >= this.numRows || endColumn >= this.numCols ||
      !Number.isInteger(startRow) || !Number.isInteger(startColumn) ||
      !Number.isInteger(endRow) || !Number.isInteger(endColumn)) {
      throw new SearError('Index out of bounds');
    }
    if (endRow < startRow || endColumn < startColumn) return;

    let rowStart = startRow;
    let index = this.indices[startRow];
    const endIndex = this.indices[endRow + 1];
    while (index < endIndex) {
      // Find the row containing the next stored entry without visiting intervening empty rows.
      let low = rowStart;
      let high = endRow;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (this.indices[middle + 1] <= index) low = middle + 1;
        else high = middle;
      }
      const row = low;
      const rowEnd = this.indices[row + 1];
      let columnStart = index;
      let columnEnd = rowEnd;
      while (columnStart < columnEnd) {
        const middle = Math.floor((columnStart + columnEnd) / 2);
        if (this.indptr[middle] < startColumn) columnStart = middle + 1;
        else columnEnd = middle;
      }
      for (let item = columnStart; item < rowEnd && this.indptr[item] <= endColumn; item += 1) {
        callback(this.data[item], row, this.indptr[item]);
      }
      index = rowEnd;
      rowStart = row + 1;
    }
  }

  /**
   * Adds an item to the matrix at the specified row and column.
   * @param {number} row - The row index.
   * @param {number} col - The column index.
   * @param {T} value - The value to add.
   * @returns {CSRMatrix<T>} The current instance for chaining.
   */
  public addItem(row: number, col: number, value: T) {
    this.assertMutable();
    this.isVaildPosition(row, col);

    if (row >= this.numRows) {
      for (let i = 0; i <= row - this.numRows; i++) {
        this.addRow(this.numRows, Array(this.numCols).fill(null));
      }
    }
    if (col >= this.numCols) {
      this.addColumn(this.numCols, Array(this.numRows).fill(null));
    }

    let pos = this.indices[row];
    while (pos < this.indices[row + 1] && this.indptr[pos] < col) pos++;

    if (pos < this.indices[row + 1] && this.indptr[pos] === col) {
      this.data[pos] = value;
    } else {
      this.data.splice(pos, 0, value);
      this.indptr.splice(pos, 0, col);
      for (let k = row + 1; k < this.indices.length; k++) this.indices[k]++;
    }

    this.notifyListeners();
    return this;
  }

  /**
   * Removes an item from the matrix at the specified row and column.
   * @param {number} row - The row index.
   * @param {number} col - The column index.
   * @returns {CSRMatrix<T>} The current instance for chaining.
   */
  public removeItem(row: number, col: number) {
    this.assertMutable();
    this.isOutOfBounds(row, col);

    for (let j = this.indices[row]; j < this.indices[row + 1]; j++) {
      if (this.indptr[j] === col) {
        this.data.splice(j, 1),
          this.indptr.splice(j, 1),
          this.indices.slice(row + 1).forEach((_, k) => this.indices[row + 1 + k]--);
        this.notifyListeners();
        return this;
      }
    }
  }

  /**
   * Adds a row to the matrix at the specified index.
   * @param {number} targetIndex - The index at which to add the row.
   * @param {(T | null)[]} row - The row to add.
   * @returns {CSRMatrix<T>} The current instance for chaining.
   * @throws Will throw an error if the length of the row does not match the number of columns.
   */
  public addRow(targetIndex: number, row: (T | null)[]) {
    this.assertMutable();
    if (row.length !== this.numCols) throw new SearError('Number of inserted row elements must equal current numCols.');

    let beforeTargetRowsItemCount = this.indices[targetIndex];

    this.indices.splice(targetIndex, 0, this.indices[targetIndex]);

    for (let i = 0; i < row.length; i++) {
      if (row[i]) {
        this.indices[targetIndex + 1]++;
        this.indptr.splice(beforeTargetRowsItemCount, 0, i);
        this.data.splice(beforeTargetRowsItemCount, 0, row[i] as T);
        beforeTargetRowsItemCount++;
      }
    }

    const increased = this.indices[targetIndex + 1] - this.indices[targetIndex];

    for (let i = targetIndex + 2; i < this.indices.length; i++) {
      this.indices[i] += increased;
    }
    this.numRows += 1;

    this.notifyListeners();
    return this;
  }

  /**
   * Deletes rows from the matrix starting at the specified index.
   * @param {number} targetIndex - The index at which to start deleting rows.
   * @param {number} numDeleteRows - The number of rows to delete.
   * @returns {CSRMatrix<T>} The current instance for chaining.
   * @throws Will throw an error if the number of rows to delete is out of bounds.
   */
  public deleteRows(targetIndex: number, numDeleteRows: number = 1) {
    this.assertMutable();
    if (targetIndex + numDeleteRows > this.numRows) throw new SearError('NumDeleteRows out of bounds');

    const currentRowsItemCount = this.indices
      .slice(targetIndex, targetIndex + numDeleteRows + 1)
      .reduce((sum, current, index, array) => {
        if (index < array.length - 1) {
          return sum + (array[index + 1] - current);
        }
        return sum;
      }, 0);

    this.indptr.splice(this.indices[targetIndex], currentRowsItemCount);
    this.data.splice(this.indices[targetIndex], currentRowsItemCount);

    this.indices.splice(targetIndex + 1, numDeleteRows);
    for (let index = targetIndex + 1; index < this.indices.length; index++) this.indices[index] -= currentRowsItemCount;

    this.numRows -= numDeleteRows;

    this.notifyListeners();
    return this;
  }

  /**
   * Swaps two rows in the matrix.
   * @param {number} targetIndex - The index of the target row.
   * @param {number} sourceIndex - The index of the source row.
   * @returns {CSRMatrix<T>} The current instance for chaining.
   */
  public swapRow(targetIndex: number, sourceIndex: number) {
    this.assertMutable();
    if (targetIndex === sourceIndex) return this;

    this.isOutOfBounds(targetIndex, 0);
    this.isOutOfBounds(sourceIndex, 0);

    if (targetIndex > sourceIndex) [targetIndex, sourceIndex] = [sourceIndex, targetIndex];

    const targetRowItemCount = this.indices[targetIndex + 1] - this.indices[targetIndex];
    const sourceRowItemCount = this.indices[sourceIndex + 1] - this.indices[sourceIndex];
    const beforeTargetRowItemCount = this.indices[targetIndex];
    const beforeSourceRowItemCount = this.indices[sourceIndex];

    for (let i = targetIndex + 1; i <= sourceIndex; i++) this.indices[i] += sourceRowItemCount - targetRowItemCount;

    const targetRowDataRange = this.data.slice(beforeTargetRowItemCount, beforeTargetRowItemCount + targetRowItemCount);
    const sourceRowDataRange = this.data.slice(beforeSourceRowItemCount, beforeSourceRowItemCount + sourceRowItemCount);
    this.data.splice(beforeTargetRowItemCount, targetRowDataRange.length, ...sourceRowDataRange);
    this.data.splice(
      beforeSourceRowItemCount + sourceRowDataRange.length - targetRowDataRange.length,
      sourceRowDataRange.length,
      ...targetRowDataRange,
    );

    const targetRowIndptrRange = this.indptr.slice(
      beforeTargetRowItemCount,
      beforeTargetRowItemCount + targetRowItemCount,
    );
    const sourceRowIndptrRange = this.indptr.slice(
      beforeSourceRowItemCount,
      beforeSourceRowItemCount + sourceRowItemCount,
    );
    this.indptr.splice(beforeTargetRowItemCount, targetRowIndptrRange.length, ...sourceRowIndptrRange);
    this.indptr.splice(
      beforeSourceRowItemCount + sourceRowIndptrRange.length - targetRowIndptrRange.length,
      sourceRowIndptrRange.length,
      ...targetRowIndptrRange,
    );

    this.notifyListeners();
    return this;
  }

  /**
   * Adds a new column to the matrix at the specified index.
   *
   * @param {number} targetIndex - The index where the new column should be inserted.
   * @param {(T | null)[]} col - An array representing the column to be added. The length of this array must match the number of rows in the matrix.
   * @returns {this} The updated matrix instance.
   * @throws {Error} If the length of the column does not match the number of rows in the matrix.
   */
  public addColumn(targetIndex: number, col: (T | null)[]) {
    this.assertMutable();
    if (col.length !== this.numRows) throw new SearError('Number of inserted col elements must equal current numRows.');

    for (let i = 0; i < col.length; i++) {
      const currentRowIndptrs = this.indptr.slice(this.indices[i], this.indices[i + 1]);
      if (col[i]) {
        if (currentRowIndptrs.length) {
          let index = currentRowIndptrs.length - 1;
          while (index >= 0) {
            if (currentRowIndptrs[index] >= targetIndex) {
              this.indptr[this.indices[i] + index]++;
            } else {
              break;
            }
            index--;
          }
          this.indptr.splice(this.indices[i] + index + 1, 0, targetIndex);
          this.data.splice(this.indices[i] + index + 1, 0, col[i] as T);
        } else {
          this.indptr.splice(this.indices[i], 0, targetIndex);
          this.data.splice(this.indices[i], 0, col[i] as T);
        }

        for (let j = i + 1; j < this.indices.length; j++) this.indices[j]++;
      } else {
        for (let m = this.indices[i]; m < this.indices[i + 1]; m++) {
          if (this.indptr[m] >= targetIndex) this.indptr[m]++;
        }
      }
    }

    this.numCols++;
    this.notifyListeners();
    return this;
  }

  /**
   * Deletes one or more columns from the matrix starting at the specified index.
   *
   * @param {number} targetIndex - The index of the first column to be deleted.
   * @param {number} [numDeleteColumns=1] - The number of columns to delete. Defaults to 1.
   * @returns {this} The updated matrix instance.
   * @throws {Error} If the range of columns to be deleted exceeds the current number of columns.
   */
  public deleteColumns(targetIndex: number, numDeleteColumns: number = 1) {
    this.assertMutable();
    if (targetIndex + numDeleteColumns > this.numCols) throw new SearError('NumDeleteColumns out of bounds');

    for (let i = this.numRows - 1; i >= 0; i--) {
      if (this.getItem(i, targetIndex)) {
        for (let j = i + 1; j < this.indices.length; j++) {
          this.indices[j]--;
        }
      }
    }

    let index = 0;
    while (index < this.indptr.length) {
      if (this.indptr[index] === targetIndex) {
        this.indptr.splice(index, 1);
        this.data.splice(index, 1);
        continue;
      }
      if (this.indptr[index] > targetIndex) this.indptr[index]--;
      index++;
    }

    this.numCols -= numDeleteColumns;

    this.notifyListeners();
    return this;
  }

  /**
   * Swaps two columns in the matrix at the specified indices.
   *
   * @param {number} targetIndex - The index of the first column to be swapped.
   * @param {number} sourceIndex - The index of the second column to be swapped.
   * @returns {this} The updated matrix instance.
   */
  public swapColumn(targetIndex: number, sourceIndex: number) {
    this.assertMutable();
    if (targetIndex === sourceIndex) return this;

    this.isOutOfBounds(0, targetIndex);
    this.isOutOfBounds(0, sourceIndex);

    if (targetIndex > sourceIndex) [targetIndex, sourceIndex] = [sourceIndex, targetIndex];

    for (let row = 0; row < this.indices.length - 1; row++) {
      const start = this.indices[row];
      const end = this.indices[row + 1];

      let col1Index = -1;
      let col2Index = -1;

      for (let i = start; i < end; i++) {
        if (this.indptr[i] === targetIndex) col1Index = i;
        if (this.indptr[i] === sourceIndex) col2Index = i;
      }

      if (col1Index !== -1 && col2Index !== -1) {
        [this.data[col1Index], this.data[col2Index]] = [this.data[col2Index], this.data[col1Index]];
      } else if (col1Index !== -1) {
        this.indptr[col1Index] = sourceIndex;
      } else if (col2Index !== -1) {
        this.indptr[col2Index] = targetIndex;
      }

      const currentRowIndices = this.indptr.slice(start, end);
      const currentRowData = this.data.slice(start, end);
      const sortedIndices = currentRowIndices
        .map((_, i) => i)
        .sort((a, b) => currentRowIndices[a] - currentRowIndices[b]);

      for (let i = 0; i < sortedIndices.length; i++) {
        this.indptr[start + i] = currentRowIndices[sortedIndices[i]];
        this.data[start + i] = currentRowData[sortedIndices[i]];
      }
    }

    this.notifyListeners();
    return this;
  }

  /**
   * Converts the matrix to a 2D array representation.
   *
   * @returns {T[][]} A 2D array representing the matrix, with each element initialized to `null` if not set.
   */
  public toArray(): T[][] {
    const denseArray: T[][] = Array.from({ length: this.numRows }, () => Array(this.numCols).fill(null));

    for (let row = 0; row < this.numRows; row++) {
      for (let j = this.indices[row]; j < this.indices[row + 1]; j++) {
        if (denseArray[row][this.indptr[j]] !== void 0) denseArray[row][this.indptr[j]] = this.data[j];
      }
    }

    return denseArray;
  }

  /**
   * Applies a set of matrix operations to the current matrix.
   *
   * @param {MatrixOTOperation<T>[]} operations - An array of operations to be applied to the matrix.
   * @returns {this} The updated matrix instance.
   */
  public override dispatch(operations: MatrixOTOperation<T>[]) {
    this.assertMutable();
    MatrixOT.apply(this, operations);
    return this;
  }
}

const validatedFrozenValues = new WeakSet<object>();
const adoptedStoredValues = new WeakSet<object>();
const lockedMatrices = new WeakSet<object>();
const csrRuntimeFields = new Set<PropertyKey>([
  'data', 'indices', 'indptr', 'numRows', 'numCols', 'defaultValue', 'name', 'ndim', 'listeners',
]);

function validateSparseStorage(values: number[], field: string): void {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!Number.isSafeInteger(value)) {
      const reported = typeof value === 'number' || value === undefined ? String(value) : typeof value;
      throw new SearError(`Committed matrix sparse coordinates must be safe integers (${field}[${index}]=${reported}).`, {
        field, index, value,
      });
    }
  }
}

function snapshotStoredValue<T>(value: T, copies: WeakMap<object, unknown>, visiting: WeakSet<object>): T {
  if (value === null || typeof value !== 'object' || adoptedStoredValues.has(value)) return value;
  if (visiting.has(value)) throw new SearError('Committed matrix values cannot contain cycles.');
  if (copies.has(value)) return copies.get(value) as T;
  visiting.add(value);
  const copy = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
  copies.set(value, copy);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) continue;
    Object.defineProperty(copy, key, {
      ...descriptor,
      value: snapshotStoredValue(descriptor.value, copies, visiting),
    });
  }
  visiting.delete(value);
  Object.freeze(copy);
  adoptedStoredValues.add(copy);
  validatedFrozenValues.add(copy);
  return copy as T;
}

function freezeStoredValue(value: unknown, seen: WeakSet<object>): void {
  if (typeof value === 'function') throw new SearError('Committed matrix values cannot contain functions.');
  if (value === null || typeof value !== 'object' || seen.has(value) || validatedFrozenValues.has(value)) return;
  seen.add(value);
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new SearError('Committed matrix values require plain data or a feature-owned immutable contract.');
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) continue;
    if (!('value' in descriptor)) throw new SearError('Committed matrix values cannot contain accessors.');
    freezeStoredValue(descriptor.value, seen);
  }
  Object.freeze(value);
  validatedFrozenValues.add(value);
}
