import { PositionRect } from '@searsuite/sear-foundation-rect';
import { HexColor } from '@searsuite/sear-foundation-utils';

import { Tree } from './Tree';
import { KDTreeNode } from './KDTreeNode';

/** KD-tree spatial index for rectangular scene data. */
export class KDTree<T extends { rect: PositionRect<HexColor> }> extends Tree<T> {
  /** Root KD-tree node. */
  private root: KDTreeNode<T> | null = null;

  /**
   * Constructs a KD-tree.
   * @param boundary - Root spatial boundary.
   * @param capacity - Retained for the shared Tree contract.
   */
  constructor(boundary = new PositionRect<HexColor>(0, 0, 100000, 100000), capacity = 4) {
    super(boundary, capacity);
  }

  /** Inserts an item by alternating x/y split axes. */
  insert(data: T): boolean {
    const insertRecursively = (node: KDTreeNode<T> | null, data: T, depth: number): KDTreeNode<T> => {
      if (!node) return new KDTreeNode(data);

      const axis = depth % 2;
      const key = axis === 0 ? 'x' : 'y';

      if (data.rect[key] < node.data.rect[key]) {
        node.left = insertRecursively(node.left, data, depth + 1);
      } else {
        node.right = insertRecursively(node.right, data, depth + 1);
      }

      return node;
    };

    this.root = insertRecursively(this.root, data, 0);
    return true;
  }

  /** Removes one item by object identity and rebuilds the experimental tree. */
  remove(data: T): boolean {
    const items: T[] = [];
    this.collect(this.root, items);
    const index = items.indexOf(data);
    if (index < 0) return false;

    items.splice(index, 1);
    this.root = null;
    items.forEach((item) => this.insert(item));
    return true;
  }

  /** Returns items whose rectangles intersect the query range. */
  query(range: PositionRect<HexColor>): T[] {
    const results: T[] = [];

    const queryRecursively = (node: KDTreeNode<T> | null, depth: number): void => {
      if (!node) return;

      const axis = depth % 2;
      const key = axis === 0 ? 'x' : 'y';

      if (
        node.data.rect.x + node.data.rect.width >= range.x &&
        node.data.rect.x <= range.x + range.width &&
        node.data.rect.y + node.data.rect.height >= range.y &&
        node.data.rect.y <= range.y + range.height
      ) {
        results.push(node.data);
      }

      if (range[key] < node.data.rect[key]) {
        queryRecursively(node.left, depth + 1);
      }
      if (range[key] + range[key === 'x' ? 'width' : 'height'] >= node.data.rect[key]) {
        queryRecursively(node.right, depth + 1);
      }
    };

    queryRecursively(this.root, 0);
    return results;
  }

  /** Removes all indexed items. */
  clear(): void {
    this.root = null;
  }

  private collect(node: KDTreeNode<T> | null, items: T[]): void {
    if (!node) return;
    items.push(node.data);
    this.collect(node.left, items);
    this.collect(node.right, items);
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
    return { boundary: this.boundary.toJSON() };
  }
}
