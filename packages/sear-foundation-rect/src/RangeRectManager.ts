import { RangeRect } from './RangeRect';

/**
 * Stores multiple `RangeRect` instances and resolves a merged value for a cell.
 *
 * The manager assumes each range contributes part of an object-like value. When
 * a cell belongs to multiple ranges, the returned result is a shallow merge of
 * all matching values in insertion order.
 *
 * @typeParam T Value type stored in each range.
 */
export class RangeRectManager<T> {
  #ranges: RangeRect<T>[] = [];

  /**
   * Adds a range to the manager.
   *
   * @param range Range definition to register.
   */
  public addRange(range: RangeRect<T>): void {
    this.#ranges.push(range);
  }

  /**
   * Returns the number of registered ranges.
   */
  public get length(): number {
    return this.#ranges.length;
  }

  /**
   * Resolves the value for a cell by shallow-merging all matching ranges.
   *
   * When no range covers the target cell, `null` is returned.
   *
   * @param row Row index to query.
   * @param col Column index to query.
   */
  public getValue(row: number, col: number): T | null {
    const merged = this.#ranges.reduce((prev, curr) => ({ ...prev, ...curr.getValue(row, col) }), {} as T);
    return Object.keys(Object.assign({}, merged)).length ? merged : null;
  }

  /**
   * Serializes all ranges in insertion order.
   *
   * A dedicated exported JSON type could be extracted later if multiple
   * packages start depending on this exact payload shape.
   */
  public toJSON(): Array<{ rect: [number, number, number, number]; value: T }> {
    return this.#ranges.map((range) => range.toJSON());
  }
}
