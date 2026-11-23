import { SearError } from '@searsuite/sear-foundation-error';
import { CSRMatrix } from './CSRMatrix';

const dimensionsMapCache = new WeakMap<DimensionsCSRMatrix, number[]>();
const trackedDimensions = new WeakSet<DimensionsCSRMatrix>();

/**
 * DimensionsCSRMatrix - Dimension-Aware Sparse Matrix Implementation
 *
 * Extends CSRMatrix to add dimension tracking capabilities, specifically designed for handling
 * row and column sizing information (e.g., row heights and column widths in a spreadsheet).
 *
 * Key Features:
 * - Caches cumulative dimension values for efficient lookups
 * - Provides boundary calculations based on dimension coordinates
 * - Binary search for efficient index-to-dimension and dimension-to-index conversions
 * - Automatic cache invalidation on matrix modifications
 *
 * Use Cases:
 * - Tracking row heights in a spreadsheet
 * - Tracking column widths in a spreadsheet
 * - Managing element sizes in responsive layouts
 * - Dimension-based collision detection in rendering engines
 *
 * @extends CSRMatrix<number> - Works specifically with numeric dimensions
 *
 * @example
 * // Create a matrix to track row heights
 * const rowHeights = new DimensionsCSRMatrix(
 *   { data: [30, 25, 40], indices: [0, 0, 0], indptr: [0, 1, 2, 3] },
 *   [3, 1]
 * );
 *
 * // Get cumulative position for efficient rendering
 * const top = rowHeights.getDimensionLeftBoundaryByIndex(2); // Sum of first 2 rows
 */
export class DimensionsCSRMatrix extends CSRMatrix<number> {
  /**
   * Constructs a DimensionsCSRMatrix instance.
   *
   * @param args - Same parameters as CSRMatrix constructor
   */
  constructor(...args: ConstructorParameters<typeof CSRMatrix<number>>) {
    super(...args);
  }

  /**
   * Sets the dimension fallback and removes matching entries so only overrides remain stored.
   * @param value - Default row height or column width returned for absent entries.
   */
  public override setDefaultValue(value: number): void {
    super.setDefaultValue(value);
    const matchingEntries: Array<[number, number]> = [];
    this.forEachStored((storedValue, row, column) => {
      if (storedValue === value) matchingEntries.push([row, column]);
    });
    matchingEntries.forEach(([row, column]) => this.removeItem(row, column));
    dimensionsMapCache.delete(this);
    this.notifyListeners();
  }

  /**
   * Stores a non-default dimension override, or removes the sparse entry when restoring the default.
   * @param row - Matrix row receiving the dimension value.
   * @param col - Matrix column receiving the dimension value.
   * @param value - Requested dimension size.
   * @returns This matrix after the sparse update.
   */
  public override addItem(row: number, col: number, value: number): this {
    if (value === this.defaultValue) {
      this.removeItem(row, col);
      return this;
    }
    return super.addItem(row, col, value);
  }

  /** Inserts a row while omitting values equal to the configured default dimension. */
  public override addRow(targetIndex: number, row: (number | null)[]): this {
    return super.addRow(
      targetIndex,
      row.map((value) => (value === this.defaultValue ? null : value)),
    );
  }

  /** Inserts a column while omitting values equal to the configured default dimension. */
  public override addColumn(targetIndex: number, column: (number | null)[]): this {
    return super.addColumn(
      targetIndex,
      column.map((value) => (value === this.defaultValue ? null : value)),
    );
  }

  /**
   * Computes and returns the cumulative dimension map.
   *
   * The dimensions map stores the cumulative sum of all dimension values up to each column.
   * For example, if dimensions are [10, 20, 30], the map is [10, 30, 60].
   * This allows O(1) lookups of boundaries without recalculating sums.
   *
   * Result is cached until the matrix is modified. Cache is automatically invalidated
   * when rows/columns are added, deleted, or modified.
   *
   * @returns {number[]} Array where element i contains the sum of dimensions 0..i
   *
   * Time Complexity: O(rows * cols) on first call or after modification, O(1) for cached result
   *
   * @example
   * const matrix = new DimensionsCSRMatrix(...);
   * const map = matrix.getDimensionsMap(); // [10, 30, 60]
   */
  public getDimensionsMap(): number[] {
    if (!trackedDimensions.has(this)) {
      this.addListener(() => { dimensionsMapCache.delete(this); });
      trackedDimensions.add(this);
    }
    const cached = dimensionsMapCache.get(this);
    if (cached) return cached;
    const dimensionsMap: number[][] = [];
    this.forEach((value, row, col) => {
      if (dimensionsMap[row]?.length) {
        dimensionsMap[row].push(dimensionsMap[row][col - 1] + (value || 0));
      } else {
        dimensionsMap[row] = [value || 0];
      }
    });
    const map = dimensionsMap[0];
    Object.freeze(map);
    dimensionsMapCache.set(this, map);
    return map;
  }

  /**
   * Gets the left boundary (start position) of a dimension at the specified column index.
   *
   * For a column at index i, returns the cumulative sum of all dimensions 0..i-1.
   * For column 0, always returns 0 (no preceding dimensions).
   *
   * Useful for determining where an element starts on a axis.
   *
   * @param {number} colIndex - The column index (0-based)
   * @returns {number} The left/start boundary position of this column
   * @throws Error if colIndex is out of bounds
   *
   * Time Complexity: O(1) after getDimensionsMap() is called once
   *
   * @example
   * // If column widths are [100, 150, 200]
   * const left = matrix.getDimensionLeftBoundaryByIndex(2); // Returns 250 (100 + 150)
   */
  public getDimensionLeftBoundaryByIndex(colIndex: number) {
    this.isOutOfBounds(0, colIndex);
    if (colIndex === 0) return 0;
    return this.getDimensionsMap()[colIndex - 1];
  }

  /**
   * Gets the right boundary (end position) of a dimension at the specified column index.
   *
   * For a column at index i, returns the cumulative sum of all dimensions 0..i.
   * This represents the end position of the element.
   *
   * Useful for determining where an element ends on a axis.
   *
   * @param {number} colIndex - The column index (0-based)
   * @returns {number} The right/end boundary position of this column
   * @throws Error if colIndex is out of bounds
   *
   * Time Complexity: O(1) after getDimensionsMap() is called once
   *
   * @example
   * // If column widths are [100, 150, 200]
   * const right = matrix.getDimensionRightBoundaryByIndex(1); // Returns 250 (100 + 150)
   */
  public getDimensionRightBoundaryByIndex(colIndex: number) {
    this.isOutOfBounds(0, colIndex);
    return this.getDimensionsMap()[colIndex];
  }

  /**
   * Finds the column index where a given cumulative dimension coordinate falls.
   *
   * Uses binary search to efficiently locate which column contains the given dimension value.
   * This is the inverse operation of getDimensionLeftBoundaryByIndex.
   *
   * Useful for: finding which cell/column is at a specific position (e.g., mouse click location).
   *
   * @param {number} dimension - The cumulative dimension value to search for
   * @returns {number} The column index where this dimension falls
   * @throws Error if the dimension value is outside the valid range
   *
   * Time Complexity: O(log cols)
   *
   * @example
   * // If column widths are [100, 150, 200] with cumulative [100, 250, 450]
   * const col = matrix.getLeftBoundaryColIndexByDimension(200); // Returns 1 (in column 1)
   */
  public getLeftBoundaryColIndexByDimension(dimension: number): number {
    const dimensionsMap = this.getDimensionsMap();
    if (dimension < 0 || dimension > dimensionsMap[dimensionsMap.length - 1])
      throw new SearError('Index out of bounds');

    let left = 0,
      right = dimensionsMap.length - 1;
    while (left < right) {
      const mid = Math.floor((left + right + 1) / 2);
      dimensionsMap[mid] > dimension ? (right = mid - 1) : (left = mid);
    }
    return left;
  }

  /**
   * Finds the column index at a given cumulative dimension coordinate using binary search.
   *
   * Returns the rightmost column index where the cumulative dimension is <= the input value.
   * This method finds the exact column boundary for a given position.
   *
   * Useful for: precise collision detection, element positioning in grids.
   *
   * @param {number} dimension - The cumulative dimension value to search for
   * @returns {number} The column index at this dimension coordinate
   * @throws Error if the dimension value is outside the valid range
   *
   * Time Complexity: O(log cols)
   *
   * @example
   * // If column widths are [100, 150, 200] with cumulative [100, 250, 450]
   * const col = matrix.getRightBoundaryColIndexByDimension(250); // Returns 1 (column 1 ends at 250)
   */
  public getRightBoundaryColIndexByDimension(dimension: number): number {
    const dimensionsMap = this.getDimensionsMap();
    if (dimension < 0 || dimension > dimensionsMap[dimensionsMap.length - 1]) {
      throw new SearError('Index out of bounds');
    }

    let left = 0,
      right = dimensionsMap.length - 1;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      dimensionsMap[mid] < dimension ? (left = mid + 1) : (right = mid - 1);
    }

    return left;
  }
}
