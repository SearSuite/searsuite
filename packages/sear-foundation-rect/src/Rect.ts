import { SearError } from '@searsuite/sear-foundation-error';

/**
 * A tuple representing a two-dimensional point in grid coordinates.
 *
 * The first item is the row index and the second item is the column index.
 */
export type Point = [number, number];

/**
 * Sentinel rectangle used to represent an empty or uninitialized grid region.
 *
 * Both corner points are set to `[-1, -1]`, which is outside any valid sheet
 * coordinate space used by the package.
 */
export const defaultRect: [Point, Point] = [
  [-1, -1],
  [-1, -1],
];
Object.freeze(defaultRect[0]);
Object.freeze(defaultRect[1]);
Object.freeze(defaultRect);

/**
 * Creates a fresh copy of the empty rectangle sentinel shape.
 */
export function createEmptyRectShape(): [Point, Point] {
  const [[startRow, startCol], [endRow, endCol]] = defaultRect;
  return [
    [startRow, startCol],
    [endRow, endCol],
  ];
}
/**
 * Creates a fresh empty rectangle sentinel instance.
 */
export function createEmptyRect(): Rect {
  return new Rect(createEmptyRectShape());
}

const lockedShapes = new WeakMap<Rect, [Point, Point]>();

/**
 * Describes a rectangle in sheet coordinates.
 *
 * The rectangle is stored as two corner points: the top-left point followed by
 * the bottom-right point. The class provides helpers for iteration, structural
 * updates after row or column mutations, and serialization.
 */
export class Rect {
  /**
   * Returns the shared empty rectangle sentinel.
   */
  static get Empty() {
    return defaultRect;
  }

  private rect: [Point, Point];

  /**
   * Creates a rectangle from two corner points.
   *
   * @param rect The rectangle bounds as `[[startRow, startCol], [endRow, endCol]]`.
   */
  constructor(rect: [Point, Point] = Rect.Empty) {
    this.rect = rect === defaultRect ? createEmptyRectShape() : rect;
  }

  /**
   * Returns the current rectangle representation.
   */
  public get shape() {
    return lockedShapes.get(this) ?? this.rect;
  }

  /**
   * Returns one of the stored corner points.
   *
   * @param index `0` for the start point, `1` for the end point.
   */
  public getPoint(index: 0 | 1) {
    return this.shape[index];
  }

  /** Creates an independent copy of this value and its mutable data. */
  public clone(): Rect {
    const [[startRow, startCol], [endRow, endCol]] = this.shape;
    return new Rect([
      [startRow, startCol],
      [endRow, endCol],
    ]);
  }

  /** Prevents changes through methods or coordinates retained from a committed state. */
  public lockMutations(): void {
    if (lockedShapes.has(this)) return;
    const [[startRow, startCol], [endRow, endCol]] = this.rect;
    const coordinates = [startRow, startCol, endRow, endCol];
    if (!coordinates.every(Number.isSafeInteger)) {
      throw new SearError('Committed rectangle coordinates must be safe integers.');
    }
    const snapshot: [Point, Point] = [[startRow, startCol], [endRow, endCol]];
    Object.freeze(snapshot[0]);
    Object.freeze(snapshot[1]);
    Object.freeze(snapshot);
    Object.freeze(this.rect[0]);
    Object.freeze(this.rect[1]);
    Object.freeze(this.rect);
    lockedShapes.set(this, snapshot);
    Object.freeze(this);
  }

  /**
   * Iterates through every cell coordinate covered by the rectangle.
   *
   * @param callbackfn Called once for each `(rowIndex, colIndex)` pair.
   */
  public forEach(callbackfn: (rowIndex: number, colIndex: number) => void) {
    const [[startRow, startCol], [endRow, endCol]] = this.shape;
    for (let rowIndex = startRow; rowIndex <= endRow; rowIndex++) {
      for (let colIndex = startCol; colIndex <= endCol; colIndex++) {
        callbackfn(rowIndex, colIndex);
      }
    }
  }

  /**
   * Expands or shifts the rectangle after a row insertion.
   *
   * If the insertion happens before the rectangle, both bounds move down.
   * If it happens inside the rectangle, only the ending bound expands.
   *
   * @param rowIndex The inserted row index.
   */
  public addRow(rowIndex: number): this {
    if (rowIndex <= this.getPoint(0)[0]) {
      this.getPoint(0)[0]++;
      this.getPoint(1)[0]++;
    } else if (rowIndex > this.getPoint(0)[0] && rowIndex <= this.getPoint(1)[0]) {
      this.getPoint(1)[0]++;
    }
    return this;
  }

  /**
   * Shrinks or shifts the rectangle after a row removal.
   *
   * If the removed row is before the rectangle, both bounds move up.
   * If it is inside the rectangle, only the ending bound contracts.
   *
   * @param rowIndex The removed row index.
   */
  public removeRow(rowIndex: number): this {
    if (rowIndex < this.getPoint(0)[0]) {
      this.getPoint(0)[0]--;
      this.getPoint(1)[0]--;
    } else if (rowIndex >= this.getPoint(0)[0] && rowIndex <= this.getPoint(1)[0]) {
      this.getPoint(1)[0]--;
    }
    return this;
  }

  /**
   * Expands or shifts the rectangle after a column insertion.
   *
   * @param colIndex The inserted column index.
   */
  public addCol(colIndex: number): this {
    if (colIndex <= this.getPoint(0)[1]) {
      this.getPoint(0)[1]++;
      this.getPoint(1)[1]++;
    } else if (colIndex > this.getPoint(0)[1] && colIndex <= this.getPoint(1)[1]) {
      this.getPoint(1)[1]++;
    }
    return this;
  }

  /**
   * Shrinks or shifts the rectangle after a column removal.
   *
   * @param colIndex The removed column index.
   */
  public removeCol(colIndex: number): this {
    if (colIndex < this.getPoint(0)[1]) {
      this.getPoint(0)[1]--;
      this.getPoint(1)[1]--;
    } else if (colIndex >= this.getPoint(0)[1] && colIndex <= this.getPoint(1)[1]) {
      this.getPoint(1)[1]--;
    }
    return this;
  }

  /**
   * Replaces the rectangle with a new set of bounds.
   *
   * @param rect The new rectangle coordinates.
   */
  public update(rect: [Point, Point]): Rect {
    this.rect = rect;
    return this;
  }

  /**
   * Serializes the rectangle to a plain object.
   */
  public toJSON(): { rect: [Point, Point] } {
    return { rect: this.shape };
  }

  /**
   * Checks whether `rectA` fully contains `rectB`.
   *
   * @param rectA The outer candidate rectangle.
   * @param rectB The inner candidate rectangle.
   */
  public static contains(rectA: Rect, rectB: Rect): boolean {
    const [[startRowA, startColA], [endRowA, endColA]] = rectA.shape;
    const [[startRowB, startColB], [endRowB, endColB]] = rectB.shape;
    return startRowA <= startRowB && endRowA >= endRowB && startColA <= startColB && endColA >= endColB;
  }

  /**
   * Computes the smallest rectangle that encloses all provided rectangles.
   *
   * @param rects The rectangles to merge into a bounding box.
   */
  public static findBoundingRectangle(rects: Rect[]): Rect {
    const xs = rects.map((rect) => [rect.getPoint(0)[0], rect.getPoint(1)[0]]).flat();
    const ys = rects.map((rect) => [rect.getPoint(0)[1], rect.getPoint(1)[1]]).flat();
    return new Rect([
      [Math.min(...xs), Math.min(...ys)],
      [Math.max(...xs), Math.max(...ys)],
    ]);
  }
}
