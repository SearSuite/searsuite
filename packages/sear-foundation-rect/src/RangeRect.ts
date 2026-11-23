/**
 * Associates a value with a rectangular range in grid coordinates.
 *
 * The range is defined as `[startRow, endRow, startCol, endCol]`, using
 * inclusive bounds on both axes.
 *
 * @typeParam T Type of the value attached to the covered range.
 */
export class RangeRect<T> {
  /**
   * Inclusive rectangle bounds encoded as
   * `[startRow, endRow, startCol, endCol]`.
   */
  rect: [number, number, number, number];
  /** Value returned for every cell covered by the range. */
  value: T;

  /**
   * Creates a range/value pair.
   *
   * @param rect Rectangle coordinates as `[startRow, endRow, startCol, endCol]`.
   * @param value Value associated with every cell inside the rectangle.
   */
  constructor(rect: [number, number, number, number], value: T) {
    this.rect = rect;
    this.value = value;
  }

  /**
   * Returns the raw rectangle bounds.
   */
  public get shape() {
    return this.rect;
  }

  /** Creates an independent copy of this value and its mutable data. */
  public clone(): RangeRect<T> {
    return new RangeRect([...this.rect], this.value);
  }

  /**
   * Returns the stored value when the requested cell lies inside the range.
   *
   * @param rowIndex Row index to query.
   * @param colIndex Column index to query.
   */
  public getValue(rowIndex: number, colIndex: number): T | null {
    if (rowIndex >= this.rect[0] && rowIndex <= this.rect[1] && colIndex >= this.rect[2] && colIndex <= this.rect[3]) {
      return this.value;
    }
    return null;
  }

  /**
   * Iterates through every covered cell and yields the stored value.
   *
   * @param callbackfn Called once for each covered cell.
   */
  public forEach(callbackfn: (rowIndex: number, colIndex: number, value: T) => void) {
    const { rect, value } = this;
    for (let rowIndex = rect[0]; rowIndex <= rect[1]; rowIndex++) {
      for (let colIndex = rect[2]; colIndex <= rect[3]; colIndex++) {
        callbackfn(rowIndex, colIndex, value);
      }
    }
  }

  /**
   * Extends the range downward when a row is inserted inside the current span.
   *
   * @param rowIndex Inserted row index.
   */
  public addRow(rowIndex: number): this {
    if (rowIndex > this.rect[0] && rowIndex < this.rect[1]) this.rect[1]++;
    return this;
  }

  /**
   * Contracts the range when a row is removed from inside the current span.
   *
   * @param rowIndex Removed row index.
   */
  public removeRow(rowIndex: number): this {
    if (rowIndex > this.rect[0] && rowIndex < this.rect[1]) this.rect[1]--;
    return this;
  }

  /**
   * Extends the range to the right when a column is inserted inside it.
   *
   * @param colIndex Inserted column index.
   */
  public addCol(colIndex: number): this {
    if (colIndex > this.rect[2] && colIndex < this.rect[3]) this.rect[3]++;
    return this;
  }

  /**
   * Contracts the range when a column is removed from inside it.
   *
   * @param colIndex Removed column index.
   */
  public removeCol(colIndex: number): this {
    if (colIndex > this.rect[2] && colIndex < this.rect[3]) this.rect[3]--;
    return this;
  }

  /**
   * Serializes the range and its associated value.
   */
  public toJSON(): { rect: [number, number, number, number]; value: T } {
    return { rect: this.rect, value: this.value };
  }
}
