import { PositionRect } from '@searsuite/sear-foundation-rect';
import { HexColor } from '@searsuite/sear-foundation-utils';

import { Tree } from './Tree';
import { OctreeNode } from './OctreeNode';

/** Simple Octree-shaped spatial index for rectangular scene data. */
export class Octree<T extends { rect: PositionRect<HexColor> }> extends Tree<T> {
  /** Root node for indexed items. */
  private root: OctreeNode<T>;

  /** Constructs an Octree with a broad default world boundary. */
  constructor() {
    const boundary = new PositionRect<HexColor>(0, 0, 100000, 100000);
    const capacity = 8;
    super(boundary, capacity);
    this.root = new OctreeNode(boundary);
  }

  /** Inserts one item into the root child list. */
  insert(data: T): boolean {
    const node = new OctreeNode(data.rect, data);
    this.root.children.push(node);
    return true;
  }

  /** Removes one item by object identity. */
  remove(data: T): boolean {
    this.root.children = this.root.children.filter((child) => child.data !== data);
    return true;
  }

  /** Returns items whose rectangles intersect the query range. */
  query(range: PositionRect<HexColor>): T[] {
    return this.root.children
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
    this.root.children = [];
  }

  /** Returns the current tree boundary. */
  getBoundary(): PositionRect<HexColor> {
    return this.boundary;
  }

  /** Replaces the boundary and clears indexed items. */
  updateBoundary(boundary: PositionRect<HexColor>): void {
    this.boundary = boundary;
    this.root = new OctreeNode(boundary);
  }

  /** Serializes debug data for this spatial index. */
  toJSON(): object {
    return {
      boundary: this.boundary.toJSON(),
      size: this.root.children.length,
    };
  }
}
