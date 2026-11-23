import { PositionRect } from '@searsuite/sear-foundation-rect';
import { HexColor } from '@searsuite/sear-foundation-utils';

import { Tree } from './Tree';

/** Hilbert-sorted R-tree style spatial index for rectangular data. */
export class HilbertRTree<T extends { rect: PositionRect<HexColor> }> extends Tree<T> {
  /** Items sorted by their simplified Hilbert value. */
  private items: T[] = [];
  /** Maximum child count retained for this tree variant. */
  private maxChildren: number;

  /**
   * Constructs a Hilbert R-tree.
   * @param boundary - Root spatial boundary.
   * @param maxChildren - Maximum children retained by the shared tree contract.
   */
  constructor(boundary: PositionRect<HexColor>, maxChildren: number = 4) {
    super(boundary, maxChildren);
    this.maxChildren = maxChildren;
  }

  /** Computes a simplified Hilbert ordering value from a rectangle center. */
  private calculateHilbertValue(rect: PositionRect<HexColor>): number {
    // Simplified Hilbert curve calculation for 2D space
    const x = rect.x + rect.width / 2; // Center x
    const y = rect.y + rect.height / 2; // Center y
    return (x << 16) + y; // Combine x and y into a single value
  }

  /** Sorts indexed items by their Hilbert ordering value. */
  private sortItems(): void {
    this.items.sort((a, b) => {
      const hilbertA = this.calculateHilbertValue(a.rect);
      const hilbertB = this.calculateHilbertValue(b.rect);
      return hilbertA - hilbertB;
    });
  }

  /** Inserts one item and maintains Hilbert ordering. */
  public insert(data: T): boolean {
    this.items.push(data);
    this.sortItems(); // Sort items by Hilbert value
    return true;
  }

  /** Returns items whose rectangles intersect the query range. */
  public query(range: PositionRect<HexColor>): T[] {
    const result: T[] = [];
    for (const item of this.items) {
      if (PositionRect.intersection(item.rect, range)) {
        result.push(item);
      }
    }
    return result;
  }

  /** Removes an item by matching rectangle bounds. */
  public remove(data: T): boolean {
    const index = this.items.findIndex(
      (item) =>
        item.rect.x === data.rect.x &&
        item.rect.y === data.rect.y &&
        item.rect.width === data.rect.width &&
        item.rect.height === data.rect.height,
    );
    if (index !== -1) {
      this.items.splice(index, 1);
      return true;
    }
    return false;
  }

  /** Removes all indexed items. */
  clear(): void {
    this.items = [];
  }

  /** Returns the current tree boundary. */
  getBoundary(): PositionRect<HexColor> {
    return this.boundary;
  }

  /** Replaces the boundary and clears indexed items. */
  updateBoundary(boundary: PositionRect<HexColor>): void {
    this.boundary = boundary;
    this.clear();
  }

  /** Serializes debug data for this spatial index. */
  toJSON(): object {
    return { boundary: this.boundary.toJSON(), size: this.items.length };
  }
}
