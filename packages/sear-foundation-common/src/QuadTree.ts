import { type IQuadTreeNode, type NodeData, type Point } from './QuadTreeTypes';

/**
 * High-level QuadTree interface for spatial data management.
 *
 * This class provides a user-friendly API for working with quadtrees.
 * It maintains a root node and delegates all operations to it.
 *
 * Typical use cases:
 * - 2D game collision detection (broad phase)
 * - Spatial database indexing
 * - Rectangle packing and overlap queries
 * - Geographic information systems (GIS) spatial queries
 *
 * @template T - The type of data stored at each point.
 */
export class QuadTree<T> {
  /** The root node of the quadtree. */
  root: IQuadTreeNode<T>;

  /**
   * Creates a new QuadTree instance with a specified root node.
   *
   * @param rootNode - The root node defining the initial boundary and capacity.
   *                   Typically created as: new QuadTreeNode({ x: 0, y: 0, width: 800, height: 600 }, 4)
   */
  constructor(rootNode: IQuadTreeNode<T>) {
    this.root = rootNode;
  }

  /**
   * Inserts a new point and associated value into the quadtree.
   *
   * @param point - The 2D coordinates where the value should be stored.
   * @param value - The data to associate with this point.
   * @returns true if insertion succeeded, false if point is outside the tree's boundary.
   */
  insert(point: Point, value: T): boolean {
    return this.root.insert({ point, value });
  }

  /**
   * Queries all values within a rectangular range.
   *
   * @param range - The query rectangle (x, y, width, height).
   * @returns Array of all data entries found within the range.
   */
  query(range: { x: number; y: number; width: number; height: number }): NodeData<T>[] {
    return this.root.query(range);
  }

  /**
   * Removes a point and its associated value from the quadtree.
   *
   * @param point - The exact coordinates of the point to remove.
   * @returns true if point was found and removed, false if not found.
   */
  remove(point: Point): boolean {
    return this.root.remove(point);
  }
}
