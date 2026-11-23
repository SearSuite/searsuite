import { QuadTreeNode, QuadTree } from '../src/QuadTreeNode';

type QuadTreeChild = NonNullable<QuadTreeNode<string>['northeast']>;

function createChild(
  boundary: QuadTreeNode<string>['boundary'],
  remove: (point: { x: number; y: number }) => boolean,
): QuadTreeChild {
  return {
    boundary,
    capacity: 1,
    points: [],
    insert: () => false,
    query: () => [],
    remove,
  } as unknown as QuadTreeChild;
}

function asConcreteNode(node: QuadTreeChild | null): QuadTreeNode<string> | null {
  return node as unknown as QuadTreeNode<string> | null;
}

describe('QuadTreeNode and QuadTree', () => {
  let rootNode: QuadTreeNode<string>;
  let quadTree: QuadTree<string>;

  beforeEach(() => {
    rootNode = new QuadTreeNode<string>({ x: 0, y: 0, width: 100, height: 100 }, 2);
    quadTree = new QuadTree(rootNode);
  });

  describe('QuadTreeNode - Initialization', () => {
    it('should create a node with correct boundary', () => {
      expect(rootNode.boundary).toEqual({
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      });
    });

    it('should initialize with correct capacity', () => {
      expect(rootNode.capacity).toBe(2);
    });

    it('should start with empty points array', () => {
      expect(rootNode.points).toEqual([]);
    });

    it('should start undivided', () => {
      expect(rootNode.divided).toBe(false);
    });

    it('should start with null child nodes', () => {
      expect(rootNode.northeast).toBeNull();
      expect(rootNode.northwest).toBeNull();
      expect(rootNode.southeast).toBeNull();
      expect(rootNode.southwest).toBeNull();
    });
  });

  describe('QuadTreeNode - Contains method', () => {
    it('should return true for point inside boundary', () => {
      const boundary = { x: 0, y: 0, width: 100, height: 100 };
      const point = { x: 50, y: 50 };
      expect(rootNode.contains(boundary, point)).toBe(true);
    });

    it('should return true for point at corner', () => {
      const boundary = { x: 0, y: 0, width: 100, height: 100 };
      const point = { x: 0, y: 0 };
      expect(rootNode.contains(boundary, point)).toBe(true);
    });

    it('should return false for point outside right edge', () => {
      const boundary = { x: 0, y: 0, width: 100, height: 100 };
      const point = { x: 100, y: 50 };
      expect(rootNode.contains(boundary, point)).toBe(false);
    });

    it('should return false for point outside bottom edge', () => {
      const boundary = { x: 0, y: 0, width: 100, height: 100 };
      const point = { x: 50, y: 100 };
      expect(rootNode.contains(boundary, point)).toBe(false);
    });

    it('should return false for point outside left edge', () => {
      const boundary = { x: 10, y: 10, width: 100, height: 100 };
      const point = { x: 5, y: 50 };
      expect(rootNode.contains(boundary, point)).toBe(false);
    });
  });

  describe('QuadTreeNode - Intersects method', () => {
    it('should return true for overlapping rectangles', () => {
      const a = { x: 0, y: 0, width: 100, height: 100 };
      const b = { x: 50, y: 50, width: 100, height: 100 };
      expect(rootNode.intersects(a, b)).toBe(true);
    });

    it('should return false for non-overlapping rectangles', () => {
      const a = { x: 0, y: 0, width: 100, height: 100 };
      const b = { x: 110, y: 0, width: 50, height: 100 };
      expect(rootNode.intersects(a, b)).toBe(false);
    });

    it('should return false for rectangle completely above', () => {
      const a = { x: 0, y: 50, width: 100, height: 100 };
      const b = { x: 0, y: 0, width: 100, height: 40 };
      expect(rootNode.intersects(a, b)).toBe(false);
    });
  });

  describe('QuadTreeNode - Subdivision', () => {
    it('should subdivide into four equal quadrants', () => {
      rootNode.subdivide();

      expect(rootNode.divided).toBe(true);
      expect(rootNode.northeast?.boundary).toEqual({
        x: 50,
        y: 0,
        width: 50,
        height: 50,
      });
      expect(rootNode.northwest?.boundary).toEqual({
        x: 0,
        y: 0,
        width: 50,
        height: 50,
      });
    });

    it('should create child nodes with same capacity', () => {
      rootNode.subdivide();
      expect(rootNode.northeast?.capacity).toBe(2);
      expect(rootNode.northwest?.capacity).toBe(2);
    });
  });

  describe('QuadTreeNode - Insert method', () => {
    it('should insert point within boundary', () => {
      const result = rootNode.insert({
        point: { x: 50, y: 50 },
        value: 'test1',
      });

      expect(result).toBe(true);
      expect(rootNode.points).toHaveLength(1);
    });

    it('should reject point outside boundary', () => {
      const result = rootNode.insert({
        point: { x: 150, y: 50 },
        value: 'test',
      });

      expect(result).toBe(false);
      expect(rootNode.points).toHaveLength(0);
    });

    it('should insert multiple points up to capacity', () => {
      rootNode.insert({ point: { x: 25, y: 25 }, value: 'p1' });
      rootNode.insert({ point: { x: 75, y: 75 }, value: 'p2' });

      expect(rootNode.points).toHaveLength(2);
      expect(rootNode.divided).toBe(false);
    });

    it('should subdivide when capacity exceeded', () => {
      rootNode.insert({ point: { x: 25, y: 25 }, value: 'p1' });
      rootNode.insert({ point: { x: 75, y: 75 }, value: 'p2' });
      rootNode.insert({ point: { x: 50, y: 50 }, value: 'p3' });

      expect(rootNode.divided).toBe(true);
    });

    it('should handle many points with multiple subdivisions', () => {
      for (let i = 0; i < 20; i++) {
        const x = Math.floor(Math.random() * 100);
        const y = Math.floor(Math.random() * 100);
        rootNode.insert({ point: { x, y }, value: `point${i}` });
      }

      const countPoints = (node: QuadTreeNode<string> | null): number => {
        if (!node) return 0;
        if (!node.divided) return node.points.length;
        return (
          node.points.length +
          countPoints(asConcreteNode(node.northeast)) +
          countPoints(asConcreteNode(node.northwest)) +
          countPoints(asConcreteNode(node.southeast)) +
          countPoints(asConcreteNode(node.southwest))
        );
      };
      const totalPoints = countPoints(rootNode);

      expect(totalPoints).toBe(20);
    });

    it('should return false when all child insertions fail in a divided node', () => {
      const node = new QuadTreeNode<string>({ x: 0, y: 0, width: 100, height: 100 }, 0);
      node.divided = true;

      const failedChild = createChild({ x: 0, y: 0, width: 50, height: 50 }, () => false);

      node.northeast = failedChild;
      node.northwest = failedChild;
      node.southeast = failedChild;
      node.southwest = failedChild;

      const result = node.insert({ point: { x: 10, y: 10 }, value: 'blocked' });
      expect(result).toBe(false);
    });
  });

  describe('QuadTreeNode - Query method', () => {
    beforeEach(() => {
      quadTree.insert({ x: 10, y: 10 }, 'A');
      quadTree.insert({ x: 30, y: 30 }, 'B');
      quadTree.insert({ x: 70, y: 70 }, 'C');
      quadTree.insert({ x: 80, y: 20 }, 'D');
      quadTree.insert({ x: 20, y: 80 }, 'E');
    });

    it('should find points within query range', () => {
      const results = quadTree.query({
        x: 0,
        y: 0,
        width: 50,
        height: 50,
      });

      expect(results.length).toBeGreaterThan(0);
      const values = results.map((result) => result.value);
      expect(values).toContain('A');
      expect(values).toContain('B');
    });

    it('should return empty array for range with no points', () => {
      const results = quadTree.query({
        x: 90,
        y: 90,
        width: 10,
        height: 10,
      });

      expect(results).toHaveLength(0);
    });

    it('should find all points with large query range', () => {
      const results = quadTree.query({
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      });

      expect(results).toHaveLength(5);
    });

    it('should handle query range intersections', () => {
      const results = quadTree.query({
        x: 60,
        y: 60,
        width: 50,
        height: 50,
      });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should verify query accuracy', () => {
      const results = quadTree.query({
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      });

      for (const result of results) {
        expect(result.point.x).toBeGreaterThanOrEqual(0);
        expect(result.point.x).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('QuadTreeNode - Remove method', () => {
    beforeEach(() => {
      quadTree.insert({ x: 25, y: 25 }, 'A');
      quadTree.insert({ x: 75, y: 75 }, 'B');
      quadTree.insert({ x: 50, y: 50 }, 'C');
      quadTree.insert({ x: 80, y: 20 }, 'D');
    });

    it('should remove point from root node', () => {
      const result = rootNode.remove({ x: 25, y: 25 });
      expect(result).toBe(true);
    });

    it('should remove point from child node', () => {
      quadTree.insert({ x: 20, y: 80 }, 'E');
      const result = quadTree.remove({ x: 50, y: 50 });
      expect(result).toBe(true);
    });

    it('should return false when removing non-existent point', () => {
      const result = rootNode.remove({ x: 999, y: 999 });
      expect(result).toBe(false);
    });

    it('should return false for missing point inside boundary when node is not divided', () => {
      const node = new QuadTreeNode<string>({ x: 0, y: 0, width: 100, height: 100 }, 2);
      const result = node.remove({ x: 10, y: 10 });
      expect(result).toBe(false);
    });

    it('should return false for point outside boundary', () => {
      const result = rootNode.remove({ x: 150, y: 150 });
      expect(result).toBe(false);
    });

    it('should handle multiple removals', () => {
      let count = 0;
      count += rootNode.remove({ x: 25, y: 25 }) ? 1 : 0;
      count += rootNode.remove({ x: 50, y: 50 }) ? 1 : 0;
      expect(count).toBe(2);
    });

    it('should not affect other points when removing one', () => {
      const beforeCount = rootNode.query({
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      }).length;
      rootNode.remove({ x: 25, y: 25 });
      const afterCount = rootNode.query({
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      }).length;
      expect(afterCount).toBe(beforeCount - 1);
    });

    it('should return false when all child removals fail in a divided node', () => {
      const node = new QuadTreeNode<string>({ x: 0, y: 0, width: 100, height: 100 }, 1);
      node.divided = true;

      const failedChild = createChild({ x: 0, y: 0, width: 50, height: 50 }, () => false);

      node.northeast = failedChild;
      node.northwest = failedChild;
      node.southeast = failedChild;
      node.southwest = failedChild;

      const result = node.remove({ x: 10, y: 10 });
      expect(result).toBe(false);
    });

    it('should short-circuit remove when northwest child succeeds', () => {
      const node = new QuadTreeNode<string>({ x: 0, y: 0, width: 100, height: 100 }, 1);
      node.divided = true;

      const northeastRemove = jest.fn(() => false);
      const southwestRemove = jest.fn(() => false);
      const southeastRemove = jest.fn(() => false);

      node.northwest = createChild(node.boundary, () => true);
      node.northeast = createChild(node.boundary, northeastRemove);
      node.southwest = createChild(node.boundary, southwestRemove);
      node.southeast = createChild(node.boundary, southeastRemove);

      expect(node.remove({ x: 10, y: 10 })).toBe(true);
      expect(northeastRemove).not.toHaveBeenCalled();
      expect(southwestRemove).not.toHaveBeenCalled();
      expect(southeastRemove).not.toHaveBeenCalled();
    });

    it('should continue to northeast when northwest remove fails', () => {
      const node = new QuadTreeNode<string>({ x: 0, y: 0, width: 100, height: 100 }, 1);
      node.divided = true;

      const southwestRemove = jest.fn(() => false);
      const southeastRemove = jest.fn(() => false);

      node.northwest = createChild(node.boundary, () => false);
      node.northeast = createChild(node.boundary, () => true);
      node.southwest = createChild(node.boundary, southwestRemove);
      node.southeast = createChild(node.boundary, southeastRemove);

      expect(node.remove({ x: 10, y: 10 })).toBe(true);
      expect(southwestRemove).not.toHaveBeenCalled();
      expect(southeastRemove).not.toHaveBeenCalled();
    });

    it('should continue to southwest when first two child removals fail', () => {
      const node = new QuadTreeNode<string>({ x: 0, y: 0, width: 100, height: 100 }, 1);
      node.divided = true;

      const southeastRemove = jest.fn(() => false);

      node.northwest = createChild(node.boundary, () => false);
      node.northeast = createChild(node.boundary, () => false);
      node.southwest = createChild(node.boundary, () => true);
      node.southeast = createChild(node.boundary, southeastRemove);

      expect(node.remove({ x: 10, y: 10 })).toBe(true);
      expect(southeastRemove).not.toHaveBeenCalled();
    });

    it('should continue to southeast when first three child removals fail', () => {
      const node = new QuadTreeNode<string>({ x: 0, y: 0, width: 100, height: 100 }, 1);
      node.divided = true;

      node.northwest = createChild(node.boundary, () => false);
      node.northeast = createChild(node.boundary, () => false);
      node.southwest = createChild(node.boundary, () => false);
      node.southeast = createChild(node.boundary, () => true);

      expect(node.remove({ x: 10, y: 10 })).toBe(true);
    });
  });

  describe('QuadTree wrapper', () => {
    it('should delegate insert to root node', () => {
      const result = quadTree.insert({ x: 50, y: 50 }, 'test');
      expect(result).toBe(true);

      const queryResults = quadTree.query({
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      });
      expect(queryResults).toHaveLength(1);
    });

    it('should delegate query to root node', () => {
      quadTree.insert({ x: 25, y: 25 }, 'A');
      quadTree.insert({ x: 75, y: 75 }, 'B');

      const results = quadTree.query({ x: 0, y: 0, width: 50, height: 50 });
      expect(results.length).toBeGreaterThan(0);
    });

    it('should delegate remove to root node', () => {
      quadTree.insert({ x: 50, y: 50 }, 'test');
      const result = quadTree.remove({ x: 50, y: 50 });
      expect(result).toBe(true);
    });
  });

  describe('Edge cases and boundary conditions', () => {
    it('should handle points exactly on boundaries', () => {
      // Subdivide first
      rootNode.insert({ point: { x: 25, y: 25 }, value: 'a' });
      rootNode.insert({ point: { x: 75, y: 75 }, value: 'b' });
      rootNode.insert({ point: { x: 50, y: 50 }, value: 'c' });

      // Try to insert on exact boundary line
      const result = rootNode.insert({
        point: { x: 50, y: 0 },
        value: 'boundary1',
      });
      expect(result).toBe(true);
    });

    it('should handle dense point insertions in same area', () => {
      let inserted = 0;
      for (let i = 0; i < 10; i++) {
        const success = rootNode.insert({
          point: { x: 25 + i * 0.1, y: 25 + i * 0.1 },
          value: `dense${i}`,
        });
        if (success) inserted++;
      }
      expect(inserted).toBe(10);
    });

    it('should handle point at exact boundary corner after subdivision', () => {
      // Create subdivision
      rootNode.insert({ point: { x: 10, y: 10 }, value: 'a' });
      rootNode.insert({ point: { x: 90, y: 90 }, value: 'b' });
      rootNode.insert({ point: { x: 50, y: 50 }, value: 'c' });

      // Query at exact boundary corner
      const results = rootNode.query({ x: 50, y: 50, width: 1, height: 1 });
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle removal and re-insertion of same point', () => {
      rootNode.insert({ point: { x: 25, y: 25 }, value: 'A' });
      rootNode.insert({ point: { x: 75, y: 75 }, value: 'B' });
      rootNode.insert({ point: { x: 50, y: 50 }, value: 'C' });

      const removed = rootNode.remove({ x: 50, y: 50 });
      expect(removed).toBe(true);

      const reinserted = rootNode.insert({
        point: { x: 50, y: 50 },
        value: 'C2',
      });
      expect(reinserted).toBe(true);
    });

    it('should handle cascading subdivision and deep queries', () => {
      const points = [
        { x: 5, y: 5 },
        { x: 15, y: 15 },
        { x: 25, y: 25 },
        { x: 55, y: 55 },
        { x: 65, y: 65 },
        { x: 75, y: 75 },
        { x: 35, y: 35 },
        { x: 45, y: 45 },
      ];

      points.forEach((p, i) => {
        rootNode.insert({ point: p, value: `p${i}` });
      });

      const centerQuad = rootNode.query({
        x: 20,
        y: 20,
        width: 60,
        height: 60,
      });
      expect(centerQuad.length).toBeGreaterThan(0);
    });

    it('should handle edge case with exact subdivision boundary points', () => {
      // Create a more subdivided tree
      const testNode = new QuadTreeNode<string>({ x: 0, y: 0, width: 200, height: 200 }, 2);

      // Insert points that will cause subdivision
      testNode.insert({ point: { x: 50, y: 50 }, value: 'p1' });
      testNode.insert({ point: { x: 100, y: 100 }, value: 'p2' });
      testNode.insert({ point: { x: 75, y: 75 }, value: 'p3' });

      // Try to query across subdivision boundaries
      const results = testNode.query({ x: 45, y: 45, width: 110, height: 110 });
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle very small boundary and dense points', () => {
      // Small boundary with high capacity
      const smallNode = new QuadTreeNode<number>({ x: 0, y: 0, width: 10, height: 10 }, 3);

      // Insert 6 points to force multiple subdivisions
      const inserted = [
        { x: 1.5, y: 1.5 },
        { x: 2.5, y: 2.5 },
        { x: 3.5, y: 3.5 },
        { x: 4.5, y: 4.5 },
        { x: 5.5, y: 5.5 },
        { x: 8.5, y: 8.5 },
      ];

      for (let i = 0; i < inserted.length; i++) {
        const result = smallNode.insert({ point: inserted[i], value: i });
        expect(result).toBe(true);
      }

      // Verify all points are findable
      const allResults = smallNode.query({ x: 0, y: 0, width: 10, height: 10 });
      expect(allResults.length).toBe(inserted.length);
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle collision detection use case', () => {
      quadTree.insert({ x: 30, y: 30 }, 'player');
      quadTree.insert({ x: 50, y: 50 }, 'enemy1');
      quadTree.insert({ x: 80, y: 80 }, 'enemy2');
      quadTree.insert({ x: 35, y: 35 }, 'powerup');

      const nearPlayer = quadTree.query({
        x: 20,
        y: 20,
        width: 30,
        height: 30,
      });
      const ids = nearPlayer.map((result) => result.value);

      expect(ids.length).toBeGreaterThan(0);
      expect(ids.length).toBeLessThan(4);
    });

    it('should handle spatial database use case', () => {
      const locations = [
        { city: 'New York', x: 10, y: 10 },
        { city: 'Boston', x: 30, y: 5 },
        { city: 'Philadelphia', x: 15, y: 25 },
      ];

      locations.forEach((loc) => {
        quadTree.insert({ x: loc.x, y: loc.y }, loc.city);
      });

      const northeast = quadTree.query({ x: 20, y: 0, width: 30, height: 30 });
      expect(northeast.length).toBeGreaterThan(0);
    });

    it('should handle dense point clouds', () => {
      const pointCount = 50;
      for (let i = 0; i < pointCount; i++) {
        const x = Math.random() * 100;
        const y = Math.random() * 100;
        quadTree.insert({ x, y }, `point${i}`);
      }

      const results = quadTree.query({ x: 25, y: 25, width: 50, height: 50 });

      for (const result of results) {
        expect(result.point.x).toBeGreaterThanOrEqual(25);
        expect(result.point.x).toBeLessThan(75);
      }

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThan(pointCount);
    });

    it('should maintain consistency through operations', () => {
      const operations: Array<
        | { op: 'insert'; point: { x: number; y: number }; value: string }
        | { op: 'remove'; point: { x: number; y: number } }
      > = [
        { op: 'insert', point: { x: 20, y: 20 }, value: 'A' },
        { op: 'insert', point: { x: 40, y: 40 }, value: 'B' },
        { op: 'insert', point: { x: 60, y: 60 }, value: 'C' },
        { op: 'remove', point: { x: 40, y: 40 } },
        { op: 'insert', point: { x: 80, y: 80 }, value: 'D' },
      ];

      for (const op of operations) {
        if (op.op === 'insert') {
          quadTree.insert(op.point, op.value);
        } else {
          quadTree.remove(op.point);
        }
      }

      const final = quadTree.query({ x: 0, y: 0, width: 100, height: 100 });
      expect(final.length).toBeGreaterThan(0);
    });
  });
});
