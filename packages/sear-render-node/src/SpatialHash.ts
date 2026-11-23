import { PositionRect } from '@searsuite/sear-foundation-rect';
import { HexColor } from '@searsuite/sear-foundation-utils';

import { Tree } from './Tree';

/** Spatial hash index that buckets rectangular items by their top-left cell. */
export class SpatialHash<T extends { rect: PositionRect<HexColor> }> extends Tree<T> {
  /** Hash buckets keyed by integer grid coordinate. */
  private grid: Map<string, T[]> = new Map();
  /** Width and height of one hash bucket. */
  private cellSize: number;

  /**
   * Constructs a spatial hash index.
   * @param cellSize - Logical size of one hash bucket.
   * @param boundary - Root spatial boundary.
   * @param capacity - Retained for the shared Tree contract.
   */
  constructor(
    cellSize: number = 100,
    boundary: PositionRect<HexColor> = new PositionRect<HexColor>(0, 0, 10000, 10000),
    capacity: number = 4,
  ) {
    super(boundary, capacity);
    this.cellSize = cellSize;
  }

  /** Builds the hash key for a world coordinate. */
  private getCellKey(x: number, y: number): string {
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    return `${cellX},${cellY}`;
  }

  /** Inserts an item into the bucket containing its top-left corner. */
  insert(data: T): boolean {
    const key = this.getCellKey(data.rect.x, data.rect.y);
    if (!this.grid.has(key)) {
      this.grid.set(key, []);
    }
    this.grid.get(key)!.push(data);
    return true;
  }

  /** Removes one item from its hashed bucket. */
  remove(data: T): boolean {
    const key = this.getCellKey(data.rect.x, data.rect.y);
    const cell = this.grid.get(key);
    if (cell) {
      this.grid.set(
        key,
        cell.filter((item) => item !== data),
      );
      return true;
    }
    return false;
  }

  /** Returns items in intersecting buckets whose rectangles overlap the query range. */
  query(range: PositionRect<HexColor>): T[] {
    const results: T[] = [];

    const startX = Math.floor(range.x / this.cellSize);
    const endX = Math.floor((range.x + range.width) / this.cellSize);
    const startY = Math.floor(range.y / this.cellSize);
    const endY = Math.floor((range.y + range.height) / this.cellSize);

    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        const key = `${x},${y}`;
        const cell = this.grid.get(key);
        if (cell) {
          results.push(
            ...cell.filter(
              (item) =>
                item.rect.x + item.rect.width >= range.x &&
                item.rect.x <= range.x + range.width &&
                item.rect.y + item.rect.height >= range.y &&
                item.rect.y <= range.y + range.height,
            ),
          );
        }
      }
    }

    return results;
  }

  /** Removes all indexed items. */
  clear(): void {
    this.grid.clear();
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
    return { boundary: this.boundary.toJSON(), size: this.grid.size };
  }
}
