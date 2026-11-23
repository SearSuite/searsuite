import { PositionRect } from '@searsuite/sear-foundation-rect';
import { type HexColor } from '@searsuite/sear-foundation-utils';

import { BVH } from '../src/BVH';
import { HilbertRTree } from '../src/HilbertRTree';
import { KDTree } from '../src/KDTree';
import { Octree } from '../src/Octree';
import { RTree } from '../src/RTree';
import { SpatialHash } from '../src/SpatialHash';
import { type Tree } from '../src/Tree';

interface SpatialItem {
  rect: PositionRect<HexColor>;
}

describe('alternative spatial indexes', () => {
  it('fulfill the shared Tree contract', () => {
    const boundary = new PositionRect<HexColor>(0, 0, 100, 100);
    const indexes: Tree<SpatialItem>[] = [
      new BVH<SpatialItem>(),
      new HilbertRTree<SpatialItem>(boundary),
      new KDTree<SpatialItem>(boundary),
      new Octree<SpatialItem>(),
      new RTree<SpatialItem>(),
      new SpatialHash<SpatialItem>(10, boundary),
    ];
    const item: SpatialItem = {
      rect: new PositionRect<HexColor>(10, 10, 10, 10),
    };

    for (const index of indexes) {
      expect(index.insert(item)).toBe(true);
      expect(index.query(boundary)).toContain(item);
      index.remove(item);
      index.updateBoundary(boundary);
      expect(index.getBoundary()).toBe(boundary);
      index.clear();
      expect(index.query(boundary)).toEqual([]);
      expect(index.toJSON?.()).toBeDefined();
    }
  });
});

describe('SpatialHash specific tests', () => {
  it('returns false when trying to remove an item not in the grid', () => {
    const boundary = new PositionRect<HexColor>(0, 0, 100, 100);
    const hash = new SpatialHash<SpatialItem>(10, boundary);
    const item: SpatialItem = {
      rect: new PositionRect<HexColor>(10, 10, 10, 10),
    };
    expect(hash.remove(item)).toBe(false);
  });

  it('uses default parameters in constructor', () => {
    const hash = new SpatialHash<SpatialItem>();
    expect(hash.getBoundary()).toBeDefined();
  });

  it('appends items to an existing bucket when inserting into the same cell key', () => {
    const boundary = new PositionRect<HexColor>(0, 0, 100, 100);
    const hash = new SpatialHash<SpatialItem>(10, boundary);
    const itemA: SpatialItem = { rect: new PositionRect<HexColor>(10, 10, 10, 10) };
    const itemB: SpatialItem = { rect: new PositionRect<HexColor>(12, 12, 10, 10) };

    hash.insert(itemA);
    hash.insert(itemB);

    const results = hash.query(new PositionRect<HexColor>(0, 0, 30, 30));
    expect(results).toContain(itemA);
    expect(results).toContain(itemB);
  });
});
