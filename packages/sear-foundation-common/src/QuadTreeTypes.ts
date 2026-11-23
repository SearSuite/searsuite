/**
 * Represents a point in 2D coordinate space.
 * Used to locate elements within the quadtree structure.
 */
export type Point = { x: number; y: number };

/**
 * Represents a node data entry in the quadtree.
 * @template T - The type of value stored at this point.
 * @property point - The 2D coordinate of this entry.
 * @property value - The actual data stored at this point.
 */
export type NodeData<T> = { point: Point; value: T };

/**
 * Interface for QuadTree nodes that support spatial partitioning operations.
 * This interface defines the core operations for a node in a quadtree structure,
 * enabling efficient spatial queries and data management.
 * @template T - The type of data stored in the quadtree.
 */
export interface IQuadTreeNode<T> {
  /** The rectangular boundary of this node in 2D space. */
  boundary: { x: number; y: number; width: number; height: number };

  /** Maximum number of points this node can hold before subdividing. */
  capacity: number;

  /** Array of data points stored in this node (before subdivision). */
  points: NodeData<T>[];

  /**
   * Inserts a data entry into the quadtree node or its children.
   * @param data - The node data containing point coordinates and value to insert.
   * @returns true if the insertion was successful, false otherwise.
   */
  insert(data: NodeData<T>): boolean;

  /**
   * Queries all data entries within a given rectangular range.
   * @param range - The query rectangle with x, y, width, and height.
   * @param found - Optional accumulator array for results (used during recursion).
   * @returns Array of all data entries found within the range.
   */
  query(range: { x: number; y: number; width: number; height: number }, found?: NodeData<T>[]): NodeData<T>[];

  /**
   * Removes a data entry at the specified point.
   * @param point - The 2D coordinates of the point to remove.
   * @returns true if removal was successful, false if point not found.
   */
  remove(point: Point): boolean;
}
