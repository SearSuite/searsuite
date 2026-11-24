import { PositionRect } from '@searsuite/sear-foundation-rect';
import { HexColor } from '@searsuite/sear-foundation-utils';

import { Tree } from './Tree';
import { BVHNode } from './BVHNode';

/** Simple bounding-volume hierarchy spatial index implementation. */
export class BVH<T extends { rect: PositionRect<HexColor> }> extends Tree<T> {
  /** Root bounding volume for all indexed items. */
  #root: BVHNode<T>;

  /** Constructs a BVH with a broad default world boundary. */
  constructor() {
    const boundary = new PositionRect<HexColor>(0, 0, 100000, 100000);
    const capacity = 4; // or another appropriate default value
    super(boundary, capacity);
    this.#root = new BVHNode(boundary);
  }

  /** Inserts one item into the root child list. */
  insert(data: T): boolean {
    const node = new BVHNode(data.rect, data);
    this.#root.children.push(node);
    return true;
  }

  /** Removes one item by object identity. */
  remove(data: T): boolean {
    this.#root.children = this.#root.children.filter((child) => child.data !== data);
    return true;
  }

  /** Returns items whose rectangles intersect the query range. */
  query(range: PositionRect<HexColor>): T[] {
    return this.#root.children
      .filter(
        (child) =>
          child.rect.x + child.rect.width >= range.x &&
          child.rect.x <= range.x + range.width &&
          child.rect.y + child.rect.height >= range.y &&
          child.rect.y <= range.y + range.height,
      )
      .map((child) => child.data!);
  }

  /** Removes all indexed items. */
  clear(): void {
    this.#root.children = [];
  }

  /** Returns the current tree boundary. */
  getBoundary(): PositionRect<HexColor> {
    return this.boundary;
  }

  /** Replaces the tree boundary and clears indexed items. */
  updateBoundary(boundary: PositionRect<HexColor>): void {
    this.boundary = boundary;
    this.#root = new BVHNode(boundary);
  }

  /** Serializes debug data for this spatial index. */
  toJSON(): object {
    return {
      boundary: this.boundary.toJSON(),
      size: this.#root.children.length,
    };
  }
}
