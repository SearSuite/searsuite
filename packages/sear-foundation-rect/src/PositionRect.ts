/**
 * Plain-object shape of a rectangle in pixel or layout coordinates.
 */
export interface PositionRectProps {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Zero-sized rectangle used as the default empty layout region.
 */
export const emptyPositionRect: PositionRectProps = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
};

/**
 * Represents a rectangle in absolute position space.
 *
 * Unlike `Rect`, which models a grid range, this class stores an origin and a
 * size. It is typically used for layout calculations, collision checks, and
 * hit-testing in rendered space.
 *
 * @typeParam T Optional key type associated with the rectangle.
 */
export class PositionRect<T = `#${string}`> {
  /** The rectangle width measured from `x`. */
  public readonly width: number;
  /** The rectangle height measured from `y`. */
  public readonly height: number;
  /** Horizontal origin of the rectangle. */
  public x: number;
  /** Vertical origin of the rectangle. */
  public y: number;
  /** Optional external identifier associated with this rectangle. */
  public key: T | undefined;

  /**
   * Creates the smallest rectangle that covers both inputs.
   *
   * @param rect1 The first rectangle.
   * @param rect2 The second rectangle.
   */
  public static merge<U>(rect1: PositionRect<U>, rect2: PositionRect<U>): PositionRect<U> {
    const minX = Math.min(rect1.x, rect2.x);
    const minY = Math.min(rect1.y, rect2.y);
    const maxX = Math.max(rect1.x + rect1.width, rect2.x + rect2.width);
    const maxY = Math.max(rect1.y + rect1.height, rect2.y + rect2.height);

    return new PositionRect<U>(minX, minY, maxX - minX, maxY - minY);
  }

  /**
   * Creates a positioned rectangle from its origin and size.
   *
   * @param x Horizontal origin.
   * @param y Vertical origin.
   * @param width Rectangle width.
   * @param height Rectangle height.
   */
  constructor(x: number, y: number, width: number, height: number) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  /**
   * Returns the rectangle origin as `[x, y]`.
   */
  public getPosition(): [number, number] {
    return [this.x, this.y];
  }

  /**
   * Returns the rectangle size as `[width, height]`.
   */
  public getSize(): [number, number] {
    return [this.width, this.height];
  }

  /**
   * Moves the rectangle without changing its size.
   *
   * @param newX New horizontal origin.
   * @param newY New vertical origin.
   */
  public updatePosition(newX: number, newY: number): void {
    this.x = newX;
    this.y = newY;
  }

  /**
   * Returns rectangle bounds as `[left, right, top, bottom]`.
   */
  public getBounds(): [number, number, number, number] {
    return [this.x, this.x + this.width, this.y, this.y + this.height];
  }

  /**
   * Checks whether a point lies inside the rectangle, including its edges.
   *
   * @param x Horizontal coordinate to test.
   * @param y Vertical coordinate to test.
   */
  public inRect(x: number, y: number): boolean {
    return x >= this.x && x <= this.x + this.width && y >= this.y && y <= this.y + this.height;
  }

  /**
   * Returns `true` when the two rectangles overlap with a non-zero area.
   *
   * Edge-touching rectangles are treated as non-intersecting.
   *
   * @param positionRect1 The first rectangle.
   * @param positionRect2 The second rectangle.
   */
  public static intersection<U>(positionRect1: PositionRect<U>, positionRect2: PositionRect<U>): boolean {
    const [x1, x2, y1, y2] = positionRect1.getBounds();
    const [x3, x4, y3, y4] = positionRect2.getBounds();
    return !(x1 >= x4 || x3 >= x2 || y1 >= y4 || y3 >= y2);
  }

  /**
   * Checks whether the first rectangle extends further than the second on at
   * least one major axis.
   *
   * This helper is useful when choosing a dominant rectangle during merge or
   * overlap resolution logic.
   *
   * @param positionRect1 The first rectangle.
   * @param positionRect2 The second rectangle.
   */
  public static hasDominantAxisSpan<U>(positionRect1: PositionRect<U>, positionRect2: PositionRect<U>): boolean {
    const positionRect1XAxis = positionRect1.x + positionRect1.width;
    const positionRect2XAxis = positionRect2.x + positionRect2.width;
    const positionRect1YAxis = positionRect1.y + positionRect1.height;
    const positionRect2YAxis = positionRect2.y + positionRect2.height;

    return positionRect1XAxis > positionRect2XAxis || positionRect1YAxis > positionRect2YAxis;
  }

  /**
   * Serializes the rectangle and its optional key to a plain object.
   */
  public toJSON(): {
    x: number;
    y: number;
    width: number;
    height: number;
    key: T | undefined;
  } {
    return {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      key: this.key,
    };
  }
}
