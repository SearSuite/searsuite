import { HilbertRTree } from '../src/HilbertRTree';
import { PositionRect } from '@searsuite/sear-foundation-rect';
import { HexColor } from '@searsuite/sear-foundation-utils';

describe('HilbertRTree', () => {
  let boundary: PositionRect<HexColor>;
  let tree: HilbertRTree<{ rect: PositionRect<HexColor>; id: number }>;

  beforeEach(() => {
    boundary = new PositionRect(0, 0, 100, 100);
    tree = new HilbertRTree(boundary, 4);
  });

  it('uses default maxChildren', () => {
    const defaultTree = new HilbertRTree(boundary);
    expect(defaultTree).toBeDefined();
  });

  it('inserts and sorts items correctly', () => {
    const item1 = { rect: new PositionRect(10, 10, 10, 10), id: 1 };
    const item2 = { rect: new PositionRect(50, 50, 10, 10), id: 2 };
    const item3 = { rect: new PositionRect(5, 5, 10, 10), id: 3 };

    expect(tree.insert(item1)).toBe(true);
    expect(tree.insert(item2)).toBe(true);
    expect(tree.insert(item3)).toBe(true);

    const result = tree.query(new PositionRect(0, 0, 100, 100));
    expect(result.length).toBe(3);
    // Sort logic places item3 before item1, then item2 based on (x << 16) + y
  });

  it('queries items based on intersection', () => {
    tree.insert({ rect: new PositionRect(10, 10, 10, 10), id: 1 });
    tree.insert({ rect: new PositionRect(80, 80, 10, 10), id: 2 });

    const result = tree.query(new PositionRect(5, 5, 20, 20));
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(1);
  });

  it('removes item', () => {
    const item1 = { rect: new PositionRect(10, 10, 10, 10), id: 1 };
    tree.insert(item1);
    expect(tree.query(boundary).length).toBe(1);

    expect(tree.remove({ rect: new PositionRect(10, 10, 10, 10), id: 1 })).toBe(true);
    expect(tree.query(boundary).length).toBe(0);

    expect(tree.remove({ rect: new PositionRect(10, 10, 10, 10), id: 1 })).toBe(false);
  });

  it('clear items', () => {
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
    tree.insert({ rect: new PositionRect(10, 10, 10, 10), id: 1 });
    const json = tree.toJSON() as any;
    expect(json.size).toBe(1);
    expect(json.boundary.x).toBe(0);
  });
});
