import { PositionRect } from '@searsuite/sear-foundation-rect';
import { type HexColor } from '@searsuite/sear-foundation-utils';

import { QuadTree, QuadTreeFactory } from '../src';

describe('QuadTree', () => {
  const boundary = new PositionRect<HexColor>(0, 0, 100, 100);

  it('can be created using QuadTreeFactory', () => {
    const factory = new QuadTreeFactory();
    const tree = factory.create(boundary, 4);
    expect(tree).toBeInstanceOf(QuadTree);
    expect(tree.capacity).toBe(4);
  });

  it('indexes rectangles that intersect a query range', () => {
    const tree = new QuadTree(boundary, 2);
    const first = new PositionRect<HexColor>(10, 10, 5, 5);
    const second = new PositionRect<HexColor>(20, 20, 5, 5);
    const outside = new PositionRect<HexColor>(80, 80, 5, 5);

    expect(tree.insert(first)).toBe(true);
    expect(tree.insert(second)).toBe(true);
    expect(tree.insert(outside)).toBe(true);

    expect(tree.query(new PositionRect(0, 0, 25, 25))).toEqual([first, second]);
  });

  it('keeps rectangles that cross a subdivision boundary at their ancestor', () => {
    const tree = new QuadTree(boundary, 1);
    const topLeft = new PositionRect<HexColor>(10, 10, 5, 5);
    const spanning = new PositionRect<HexColor>(45, 45, 20, 20);

    tree.insert(topLeft);
    tree.insert(spanning);

    expect(tree.divided).toBe(true);
    expect(tree.rects).toContain(spanning);
    expect(tree.query(new PositionRect(55, 55, 5, 5))).toEqual([spanning]);
  });

  it('removes a matching rectangle without removing equivalent entries rejected by the predicate', () => {
    const tree = new QuadTree(boundary, 4);
    const first = new PositionRect<HexColor>(10, 10, 5, 5);
    const equivalent = new PositionRect<HexColor>(10, 10, 5, 5);

    tree.insert(first);
    tree.insert(equivalent);

    expect(tree.remove(first, (rect) => rect === first)).toBe(true);
    expect(tree.query(boundary)).toEqual([equivalent]);
    expect(tree.remove(first)).toBe(true);
    expect(tree.query(boundary)).toEqual([]);
  });

  it('rejects rectangles outside its boundary and rebuilds contents when the boundary changes', () => {
    const tree = new QuadTree(boundary, 2);
    const retained = new PositionRect<HexColor>(10, 10, 5, 5);

    expect(tree.insert(new PositionRect(120, 120, 5, 5))).toBe(false);
    tree.insert(retained);
    tree.updateBoundary(new PositionRect(0, 0, 20, 20));

    expect(tree.getBoundary()).toEqual(new PositionRect(0, 0, 20, 20));
    expect(tree.query(new PositionRect(0, 0, 20, 20))).toEqual([retained]);
  });

  it('throws an error if subdividing a tree with 0 width or height', () => {
    const zeroTree = new QuadTree(new PositionRect(0, 0, 0, 0), 1);
    expect(() => zeroTree.subdivide()).toThrow('QuadTree boundary width and height must be greater than 0');
  });

  it('returns false when trying to remove from an undivided tree with no matching rect', () => {
    const tree = new QuadTree(boundary, 4);
    const rect = new PositionRect<HexColor>(10, 10, 5, 5);
    expect(tree.remove(rect)).toBe(false);
  });

  it('handles query and remove when divided but children are null', () => {
    const tree = new QuadTree(boundary, 1);
    tree.insert(new PositionRect<HexColor>(10, 10, 5, 5));
    tree.insert(new PositionRect<HexColor>(20, 20, 5, 5));

    // Force children to null to test optional chaining
    tree.topleft = null;
    tree.topright = null;
    tree.bottomleft = null;
    tree.bottomright = null;

    // Should not throw and should handle optional chaining gracefully
    expect(tree.query(boundary).length).toBe(0);
    expect(tree.remove(new PositionRect<HexColor>(20, 20, 5, 5))).toBe(false);
  });

  it('recursively removes from late child branches when earlier child checks fail', () => {
    const tree = new QuadTree(boundary, 1);
    const first = new PositionRect<HexColor>(10, 10, 5, 5);
    const target = new PositionRect<HexColor>(80, 80, 5, 5);

    tree.insert(first);
    tree.insert(target);

    expect(tree.divided).toBe(true);
    expect(tree.remove(target)).toBe(true);
    expect(tree.query(new PositionRect(70, 70, 20, 20))).toEqual([]);
  });

  it('provides a toJSON object', () => {
    const tree = new QuadTree(boundary, 4);
    expect(tree.toJSON()).toEqual({});
  });
});
