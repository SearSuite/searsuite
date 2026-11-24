import { PositionRect } from './PositionRect';

/**
 * Maintains a collection of positioned rectangles that are updated together.
 *
 * This manager is intentionally lightweight. It acts as a shared holder for
 * rectangles that should move in lockstep, such as overlay fragments that track
 * the same origin.
 *
 * @typeParam PositionRectKeyType Type used by managed rectangle keys.
 */
export class PositionRectManager<PositionRectKeyType> {
  #positionRects: PositionRect<PositionRectKeyType>[] = [];

  /** Creates a PositionRectManager instance. */
  constructor() {}

  /**
   * Registers a rectangle with the manager.
   *
   * @param positionRect Rectangle instance to track.
   */
  public addPositionRect(positionRect: PositionRect<PositionRectKeyType>) {
    this.#positionRects.push(positionRect);
  }

  /**
   * Moves every managed rectangle to the same new origin.
   *
   * @param newX New horizontal origin.
   * @param newY New vertical origin.
   */
  public updatePosition(newX: number, newY: number) {
    this.#positionRects.forEach((positionRect) => {
      positionRect.updatePosition(newX, newY);
    });
  }

  /**
   * Returns the number of registered rectangles.
   */
  public get length() {
    return this.#positionRects.length;
  }
}
