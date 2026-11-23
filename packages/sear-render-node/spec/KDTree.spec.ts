import { KDTree } from '../src/KDTree';
import { PositionRect } from '@searsuite/sear-foundation-rect';
import { HexColor } from '@searsuite/sear-foundation-utils';

describe('KDTree', () => {
  let boundary: PositionRect<HexColor>;
  let tree: KDTree<{ rect: PositionRect<HexColor>; id: number }>;

  beforeEach(() => {
    boundary = new PositionRect(0, 0, 100, 100);
    tree = new KDTree(boundary, 4);
  });

  it('uses default constructor arguments', () => {
    const defaultTree = new KDTree();
    expect(defaultTree).toBeDefined();
    expect(defaultTree.getBoundary().width).toBe(100000);
  });

  it('inserts and queries items', () => {
    const item1 = { rect: new PositionRect(10, 10, 10, 10), id: 1 };
    const item2 = { rect: new PositionRect(50, 50, 10, 10), id: 2 };
    // Trigger right and left paths
    const item3 = { rect: new PositionRect(5, 50, 10, 10), id: 3 };
    const item4 = { rect: new PositionRect(60, 5, 10, 10), id: 4 };

    expect(tree.insert(item1)).toBe(true);
    expect(tree.insert(item2)).toBe(true);
    expect(tree.insert(item3)).toBe(true);
    expect(tree.insert(item4)).toBe(true);

    const result = tree.query(new PositionRect(0, 0, 20, 100));
    // Should include item1 and item3
    expect(result.length).toBe(2);
    expect(result.map((r) => r.id).sort()).toEqual([1, 3]);

    const resultRight = tree.query(new PositionRect(40, 40, 30, 30));
    expect(resultRight.length).toBe(1);
    expect(resultRight[0].id).toBe(2);
  });

  it('removes one item by object identity', () => {
    const item1 = { rect: new PositionRect(10, 10, 10, 10), id: 1 };
    const item2 = { rect: new PositionRect(50, 50, 10, 10), id: 2 };
    tree.insert(item1);
    tree.insert(item2);

    expect(tree.remove(item1)).toBe(true);
    expect(tree.remove(item1)).toBe(false);
    expect(tree.query(new PositionRect(0, 0, 100, 100))).toEqual([item2]);
  });

  it('clears items', () => {
    tree.insert({ rect: new PositionRect(10, 10, 10, 10), id: 1 });
    tree.clear();
    expect(tree.query(boundary).length).toBe(0);
  });

  it('getBoundary', () => {
    expect(tree.getBoundary()).toBe(boundary);
  });

  it('updateBoundary', () => {
    tree.insert({ rect: new PositionRect(10, 10, 10, 10), id: 1 });
    const newBoundary = new PositionRect(0, 0, 200, 200);
    tree.updateBoundary(newBoundary);
    expect(tree.getBoundary()).toBe(newBoundary);
    expect(tree.query(newBoundary).length).toBe(0); // clear is called
  });

  it('toJSON', () => {
    const json = tree.toJSON() as any;
    expect(json.boundary.x).toBe(0);
  });
});
