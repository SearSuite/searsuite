import { SearError } from '@searsuite/sear-foundation-error';
import { PositionRect } from '@searsuite/sear-foundation-rect';
import { Injectable } from '@searsuite/sear-foundation-di';
import { HexColor } from '@searsuite/sear-foundation-utils';

import { Tree } from './Tree';

/** QuadTree spatial index used by scene and dirty-region lookups. */
@Injectable()
export class QuadTree extends Tree<PositionRect<HexColor>> {
  /** Rectangles stored directly in this node. */
  rects: PositionRect<HexColor>[];
  /** Whether this node has been subdivided into children. */
  divided: boolean;
  /** Top-right child node. */
  topright: QuadTree | null = null;
  /** Top-left child node. */
  topleft: QuadTree | null = null;
  /** Bottom-right child node. */
  bottomright: QuadTree | null = null;
  /** Bottom-left child node. */
  bottomleft: QuadTree | null = null;

  /**
   * Constructs a QuadTree node.
   * @param boundary - Node boundary.
   * @param capacity - Maximum items before subdivision.
   */
  constructor(boundary: PositionRect<HexColor>, capacity: number) {
    super(boundary, capacity);
    this.rects = [];
    this.divided = false;
  }

  /** Splits this node into four child quadrants and redistributes contained items. */
  subdivide() {
    const { x, y, width, height } = this.boundary;
    if (width === 0 || height === 0) {
      throw new SearError('QuadTree boundary width and height must be greater than 0');
    }
    const hw = width / 2,
      hh = height / 2;
    this.topleft = new QuadTree(new PositionRect(x, y, hw, hh), this.capacity);
    this.topright = new QuadTree(new PositionRect(x + hw, y, hw, hh), this.capacity);
    this.bottomleft = new QuadTree(new PositionRect(x, y + hh, hw, hh), this.capacity);
    this.bottomright = new QuadTree(new PositionRect(x + hw, y + hh, hw, hh), this.capacity);
    this.divided = true;

    // Fix: Only insert data that can be fully contained into child nodes, keep others in the current node
    const remain: PositionRect<HexColor>[] = [];
    for (const data of this.rects) {
      const inserted =
        (this.topright && this.contains(this.topright.boundary, data) && this.topright.insert(data)) ||
        (this.topleft && this.contains(this.topleft.boundary, data) && this.topleft.insert(data)) ||
        (this.bottomright && this.contains(this.bottomright.boundary, data) && this.bottomright.insert(data)) ||
        (this.bottomleft && this.contains(this.bottomleft.boundary, data) && this.bottomleft.insert(data));
      if (!inserted) {
        remain.push(data);
      }
    }
    this.rects = remain;
  }

  /** Returns whether boundary fully contains rect. */
  contains(boundary: PositionRect<HexColor>, rect: PositionRect<HexColor>): boolean {
    return (
      rect.x >= boundary.x &&
      rect.y >= boundary.y &&
      rect.x + rect.width <= boundary.x + boundary.width &&
      rect.y + rect.height <= boundary.y + boundary.height
    );
  }

  /** Returns whether two rectangles overlap. */
  intersects(a: PositionRect<HexColor>, b: PositionRect<HexColor>): boolean {
    return !(b.x > a.x + a.width || b.x + b.width < a.x || b.y > a.y + a.height || b.y + b.height < a.y);
  }

  /**
   * Inserts a rectangle into the tree.
   * @param data - Rectangle to index.
   * @returns True when data intersects this tree boundary.
   */
  insert(data: PositionRect<HexColor>): boolean {
    if (!this.intersects(this.boundary, data)) {
      return false;
    }
    if (this.rects.length < this.capacity && !this.divided) {
      this.rects.push(data);
      return true;
    }
    if (!this.divided) {
      this.subdivide();
    }

    // Try to find a child node that can fully contain the data
    const candidates = [this.topright, this.topleft, this.bottomright, this.bottomleft].filter(
      (node) => node && this.contains(node.boundary, data),
    );

    // If there is a child node that can fully contain the data, insert into the first matching child node
    if (candidates.length > 0) {
      return candidates[0]!.insert(data);
    }

    // If no child node can fully contain the data, it means the data spans multiple child nodes, keep it in the current node
    this.rects.push(data);
    return true;
  }

  /**
   * Queries rectangles intersecting a range.
   * @param range - Search rectangle.
   * @param found - Accumulator used during recursion.
   * @returns Matching rectangles.
   */
  query(range: PositionRect<HexColor>, found: PositionRect<HexColor>[] = []): PositionRect<HexColor>[] {
    if (!PositionRect.intersection(this.boundary, range)) return found;

    for (const item of this.rects) {
      if (PositionRect.intersection(range, item)) found.push(item);
    }

    if (this.divided) {
      this.topleft?.query(range, found);
      this.topright?.query(range, found);
      this.bottomleft?.query(range, found);
      this.bottomright?.query(range, found);
    }
    return found;
  }

  /**
   * Removes matching rectangle entries.
   * @param data - Rectangle coordinates to remove.
   * @param predicate - Optional predicate for entries with matching bounds.
   * @returns True when an entry was removed.
   */
  remove(data: PositionRect<HexColor>, predicate: (rect: PositionRect<HexColor>) => boolean = () => true): boolean {
    if (!this.contains(this.boundary, data)) return false;

    // const idx = this.rects.findIndex(
    //     d =>
    //         d.x === data.x &&
    //         d.y === data.y &&
    //         d.width === data.width &&
    //         d.height === data.height
    // );
    // if (idx !== -1) {
    //     this.rects.splice(idx, 1);
    //     return true;
    // }
    let removed = false;
    for (let i = this.rects.length - 1; i >= 0; i--) {
      const d = this.rects[i];
      if (d.x === data.x && d.y === data.y && d.width === data.width && d.height === data.height && predicate(d)) {
        this.rects.splice(i, 1);
        removed = true;
      }
    }

    if (removed) {
      return true;
    }

    if (this.divided) {
      return (
        this.topleft?.remove(data, predicate) ||
        this.topright?.remove(data, predicate) ||
        this.bottomleft?.remove(data, predicate) ||
        this.bottomright?.remove(data, predicate) ||
        false
      );
    }
    return false;
  }

  /** Clears all indexed rectangles and child quadrants. */
  clear() {
    this.rects = [];
    this.divided = false;
    this.topright = null;
    this.topleft = null;
    this.bottomright = null;
    this.bottomleft = null;
  }

  /** Returns the root boundary for this tree node. */
  getBoundary(): PositionRect<HexColor> {
    return this.boundary;
  }

  /**
   * Replaces the boundary and reinserts existing rectangles.
   * @param boundary - New root boundary.
   */
  updateBoundary(boundary: PositionRect<HexColor>): void {
    const children = this.query(this.boundary);
    this.clear();
    this.boundary = boundary;
    for (const child of children) {
      this.insert(child);
    }
  }

  /** Serializes debug data for this tree. */
  toJSON(): object {
    return {};
  }
}

export { QuadTreeFactory } from './QuadTreeFactory';
