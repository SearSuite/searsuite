import { type IQuadTreeNode, type NodeData, type Point } from './QuadTreeTypes';

/**
 * Implementation of a QuadTree node for efficient 2D spatial partitioning.
 *
 * A QuadTree divides a 2D space into four quadrants recursively, enabling fast
 * spatial queries. This implementation is particularly useful for:
 * - Range queries on 2D data
 * - Collision detection in graphics/gaming
 * - Spatial indexing in databases
 * - Performance optimization for large datasets
 *
 * The tree automatically subdivides nodes when they exceed capacity, creating a
 * balanced spatial structure. Each node can hold up to 'capacity' points before
 * subdividing into four child nodes (northeast, northwest, southeast, southwest).
 *
 * @template T - The type of data stored at each point in the quadtree.
 */
export class QuadTreeNode<T> implements IQuadTreeNode<T> {
  /** The rectangular boundary of this node in 2D space. */
  boundary: { x: number; y: number; width: number; height: number };

  /** Maximum number of points this node can hold before subdividing. */
  capacity: number;

  /** Array of data points stored in this node (before subdivision). */
  points: NodeData<T>[];

  /** Flag indicating whether this node has been subdivided into children. */
  divided: boolean;

  /** Northeast child node (upper-right quadrant). */
  northeast: IQuadTreeNode<T> | null;

  /** Northwest child node (upper-left quadrant). */
  northwest: IQuadTreeNode<T> | null;

  /** Southeast child node (lower-right quadrant). */
  southeast: IQuadTreeNode<T> | null;

  /** Southwest child node (lower-left quadrant). */
  southwest: IQuadTreeNode<T> | null;

  /**
   * Creates a new QuadTree node with specified boundary and capacity.
   * @param boundary - The rectangular area this node covers.
   * @param capacity - Maximum points before node subdivides (typically 4).
   */
  constructor(boundary: { x: number; y: number; width: number; height: number }, capacity: number) {
    this.boundary = boundary;
    this.capacity = capacity;
    this.points = [];
    this.divided = false;
    this.northeast = null;
    this.northwest = null;
    this.southeast = null;
    this.southwest = null;
  }

  /**
   * Subdivides this node into four equal child nodes (quadrants).
   * Called when the node reaches capacity and needs to distribute points
   * to child nodes for better spatial organization.
   *
   * The subdivision creates four equal rectangles:
   * - Northeast (NE): upper-right
   * - Northwest (NW): upper-left
   * - Southeast (SE): lower-right
   * - Southwest (SW): lower-left
   */
  subdivide() {
    const { x, y, width, height } = this.boundary;
    const newWidth = width / 2;
    const newHeight = height / 2;

    this.northeast = new QuadTreeNode({ x: x + newWidth, y: y, width: newWidth, height: newHeight }, this.capacity);
    this.northwest = new QuadTreeNode({ x: x, y: y, width: newWidth, height: newHeight }, this.capacity);
    this.southeast = new QuadTreeNode(
      { x: x + newWidth, y: y + newHeight, width: newWidth, height: newHeight },
      this.capacity,
    );
    this.southwest = new QuadTreeNode({ x: x, y: y + newHeight, width: newWidth, height: newHeight }, this.capacity);

    this.divided = true;
  }

  /**
   * Inserts a data entry into the quadtree.
   * The insertion process:
   * 1. Checks if the point is within this node's boundary
   * 2. If node has capacity, adds point directly
   * 3. If node is full, subdivides and recursively inserts into children
   *
   * This ensures the tree grows in a balanced manner, with points distributed
   * across quadrants as the tree expands.
   *
   * @param data - The point and value to insert.
   * @returns true if insertion succeeded, false if point is outside boundary.
   */
  insert(data: NodeData<T>): boolean {
    // Check if point is within this node's boundary
    if (!this.contains(this.boundary, data.point)) {
      return false;
    }

    // If this node has capacity, add the point directly
    if (this.points.length < this.capacity) {
      this.points.push(data);
      return true;
    } else {
      // Node is full - subdivide if not already done
      if (!this.divided) {
        this.subdivide();
      }

      // Try inserting into one of the four child quadrants
      if (this.northeast!.insert(data)) return true;
      if (this.northwest!.insert(data)) return true;
      if (this.southeast!.insert(data)) return true;
      if (this.southwest!.insert(data)) return true;
    }

    return false;
  }

  /**
   * Checks if a point is contained within a rectangular boundary.
   * Uses inclusive lower bound and exclusive upper bound for consistency.
   *
   * @param boundary - The rectangle to check against.
   * @param point - The point to test.
   * @returns true if the point is within the boundary (x1 <= x < x2, y1 <= y < y2).
   */
  contains(boundary: { x: number; y: number; width: number; height: number }, point: Point): boolean {
    return (
      point.x >= boundary.x &&
      point.x < boundary.x + boundary.width &&
      point.y >= boundary.y &&
      point.y < boundary.y + boundary.height
    );
  }

  /**
   * Finds all data entries within a given rectangular range.
   * This is the primary query operation for spatial lookups.
   *
   * The query process:
   * 1. Checks if the query range intersects with this node's boundary
   * 2. If no intersection, skips this node and its children
   * 3. If intersection, checks all points in this node
   * 4. Recursively queries child nodes if subdivided
   *
   * This approach provides O(log N) average performance for sparse data.
   *
   * @param range - The rectangular area to query.
   * @param found - Accumulator array (for recursion, default empty array).
   * @returns Array of all data entries found within the range.
   */
  query(range: { x: number; y: number; width: number; height: number }, found: NodeData<T>[] = []): NodeData<T>[] {
    // Early exit if query range doesn't intersect with this node
    if (!this.intersects(range, this.boundary)) {
      return found;
    }

    // Check all points in this node against the query range
    for (const point of this.points) {
      if (this.contains(range, point.point)) {
        found.push(point);
      }
    }

    // Recursively query child nodes if this node has been subdivided
    if (this.divided) {
      this.northwest!.query(range, found);
      this.northeast!.query(range, found);
      this.southwest!.query(range, found);
      this.southeast!.query(range, found);
    }

    return found;
  }

  /**
   * Checks if two rectangles intersect (have any overlapping area).
   * Uses the separating axis theorem for AABB (Axis-Aligned Bounding Box) collision.
   *
   * Two rectangles do NOT intersect if:
   * - Rectangle A is completely to the right of B
   * - Rectangle A is completely to the left of B
   * - Rectangle A is completely below B
   * - Rectangle A is completely above B
   *
   * @param a - First rectangle.
   * @param b - Second rectangle.
   * @returns true if the rectangles intersect, false otherwise.
   */
  intersects(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
  ): boolean {
    return !(b.x > a.x + a.width || b.x + b.width < a.x || b.y > a.y + a.height || b.y + b.height < a.y);
  }

  /**
   * Removes a data entry at the specified point coordinates.
   *
   * The removal process:
   * 1. Checks if point is within this node's boundary
   * 2. Searches and removes the point from this node's points array
   * 3. If not found, recursively searches child nodes
   *
   * Note: This operation does not trigger node merging after removal,
   * so the tree structure may become unbalanced over time with many removals.
   *
   * @param point - The exact coordinates of the point to remove.
   * @returns true if point was found and removed, false if not found.
   */
  remove(point: Point): boolean {
    // Check if point is within this node's boundary
    if (!this.contains(this.boundary, point)) {
      return false;
    }

    // Try to find and remove the point from this node's array
    const index = this.points.findIndex((p) => p.point.x === point.x && p.point.y === point.y);
    if (index !== -1) {
      this.points.splice(index, 1);
      return true;
    }

    // If not found, recursively search child nodes
    if (this.divided) {
      if (this.northwest!.remove(point)) return true;
      if (this.northeast!.remove(point)) return true;
      if (this.southwest!.remove(point)) return true;
      if (this.southeast!.remove(point)) return true;
    }

    return false;
  }
}

export { QuadTree } from './QuadTree';
export { type IQuadTreeNode, type NodeData, type Point } from './QuadTreeTypes';
