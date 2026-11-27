import { Node } from '../src';
import { HitColorRegistry } from '../src';
import { PositionRect } from '@searsuite/sear-foundation-rect';
import { Container, Injectable } from '@searsuite/sear-foundation-di';
import { SheetHorizontalAlignment, SheetVerticalAlignment } from '@searsuite/sear-domain-cell-types';

let container: Container;

@Injectable()
class FakeTree {
  items: any[] = [];
  boundary = new PositionRect(0, 0, 100, 100);
  getBoundary() {
    return this.boundary;
  }
  updateBoundary(b: any) {
    this.boundary = b;
  }
  insert(item: any) {
    this.items.push(item);
  }
  remove(item: any, predicate: any) {
    const idx = this.items.findIndex(predicate);
    if (idx !== -1) this.items.splice(idx, 1);
  }
  query() {
    return this.items;
  }
}

@Injectable()
class FakeConfig {
  get() {
    return {};
  }
}

class FakeDataStorage {
  public readonly map = new Map<unknown, unknown>();

  get(key: unknown): unknown {
    return this.map.get(key);
  }
  set(key: unknown, value: unknown): void {
    this.map.set(key, value);
  }
  delete(key: unknown): void {
    this.map.delete(key);
  }
}

const sharedFakeTree = new FakeTree();
const sharedFakeDataStorage = new FakeDataStorage();

@Injectable()
class FakeTreeProvider {
  get boundary() {
    return sharedFakeTree.boundary;
  }
  set boundary(value: PositionRect) {
    sharedFakeTree.boundary = value;
  }
  get items() {
    return sharedFakeTree.items;
  }
  getBoundary() {
    return sharedFakeTree.getBoundary();
  }
  updateBoundary(b: any) {
    sharedFakeTree.updateBoundary(b);
  }
  insert(item: any) {
    sharedFakeTree.insert(item);
  }
  remove(item: any, predicate: any) {
    sharedFakeTree.remove(item, predicate);
  }
  query(r: any) {
    return sharedFakeTree.query();
  }
}

@Injectable()
class FakeDataStorageProvider {
  get(key: any) {
    return sharedFakeDataStorage.get(key);
  }
  set(key: any, val: any) {
    sharedFakeDataStorage.set(key, val);
  }
  delete(key: any) {
    sharedFakeDataStorage.delete(key);
  }
}

@Injectable()
class FakeHitColorRegistryProvider {
  public readonly map = new Map<string, unknown>();

  register(key: string, value: unknown): void {
    this.map.set(key, value);
  }
  get(key: string): unknown {
    return this.map.get(key);
  }
  delete(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

class TestNode extends Node<any> {
  constructor(positionRect?: any, props?: any) {
    super(positionRect, props, container);
  }
  clear() {}
  drawScene() {}
  drawHit() {}
}

describe('Node', () => {
  beforeEach(() => {
    container = new Container();
    sharedFakeTree.items = [];
    sharedFakeTree.boundary = new PositionRect(0, 0, 100, 100);
    sharedFakeDataStorage.map.clear();

    container.register(Symbol.for('Tree'), FakeTreeProvider);
    container.register(Symbol.for('ConfigEngine'), FakeConfig);
    container.register(Symbol.for('DataStorage'), FakeDataStorageProvider);
    container.registerInstance(HitColorRegistry.symbol, new FakeHitColorRegistryProvider());
  });

  it('initializes and updates boundary if needed', () => {
    const tree = container.resolve<any>(Symbol.for('Tree'));
    tree.boundary = new PositionRect(0, 0, 10, 10);
    // positionRect spans outside boundary
    const node = new TestNode({ x: 0, y: 0, width: 20, height: 20 }, {});
    expect(tree.boundary.width).toBe(20);
    expect(node.depth).toBe(0);
  });

  it('add single and multiple children', () => {
    const node = new TestNode({ x: 0, y: 0, width: 10, height: 10 }, {});
    const child1 = new TestNode({ x: 0, y: 0, width: 10, height: 10 }, {});
    const child2 = new TestNode({ x: 0, y: 0, width: 10, height: 10 }, {});
    (child1 as any).randomColorKey = '#123';
    (child2 as any).randomColorKey = '#456';

    node.add(child1);
    node.add([child2]);

    expect(node.childKeys).toContain(child1.nodeKey);
    expect(node.childKeys).toContain(child2.nodeKey);
    expect(child1.parentKey).toBe(node.nodeKey);
  });

  it('add accepts a child without a hit color when it has a stable node key', () => {
    const node = new TestNode({ x: 0, y: 0, width: 10, height: 10 }, {});
    const child1 = new TestNode({ x: 0, y: 0, width: 10, height: 10 }, {});
    (child1 as any).randomColorKey = undefined; // artificially remove
    expect(() => node.add(child1)).not.toThrow();
    expect(node.childKeys).toContain(child1.nodeKey);
  });

  it('query returns nodes sorted by depth', () => {
    const node = new TestNode({ x: 0, y: 0, width: 10, height: 10 }, {});
    const child1 = new TestNode({ x: 0, y: 0, width: 10, height: 10 }, { depth: 2 });
    const child2 = new TestNode({ x: 0, y: 0, width: 10, height: 10 }, { depth: 1 });
    (child1 as any).randomColorKey = '#111';
    (child2 as any).randomColorKey = '#222';
    node.add([child1, child2]);

    const tree = container.resolve<any>(Symbol.for('Tree'));
    // Add unordered nodes to tree query result conceptually
    const res = node.query(new PositionRect(0, 0, 10, 10));
    expect(res).toEqual([child2, child1]); // sorted by depth

    // Test positionRect missing key branch
    tree.items.push(new PositionRect(0, 0, 10, 10)); // no key
    const res2 = node.query(new PositionRect(0, 0, 10, 10));
    expect(res2).toEqual([child2, child1]);
  });

  it('removeChild and dispose', () => {
    const node = new TestNode({ x: 0, y: 0, width: 10, height: 10 }, {});
    const child = new TestNode({ x: 0, y: 0, width: 10, height: 10 }, {});
    (child as any).randomColorKey = '#111';
    node.add(child);

    expect(node.childKeys).toContain(child.nodeKey);
    node.removeChild(child);
    expect(node.childKeys).not.toContain(child.nodeKey);
  });

  it('removeChild handles no randomColorKey', () => {
    const node = new TestNode({ x: 0, y: 0, width: 10, height: 10 }, {});
    const child = new TestNode({ x: 0, y: 0, width: 10, height: 10 }, {});
    (child as any).randomColorKey = undefined;
    expect(() => node.removeChild(child)).not.toThrow();
  });

  it('dispose handles missing node from storage', () => {
    const node = new TestNode({ x: 0, y: 0, width: 10, height: 10 }, {});
    (node as any).randomColorKey = '#abc'; // make sure it clears
    const store = container.resolve<any>(Symbol.for('DataStorage'));
    store.set(node.nodeKey, node);
    // remove manually
    store.delete(node.nodeKey);
    expect(() => node.dispose()).not.toThrow();
  });

  it('getters', () => {
    const node = new TestNode(
      { x: 1, y: 2, width: 3, height: 4 },
      {
        top: 5,
        bottom: 6,
        left: 7,
        right: 8,
        horizontalAlign: SheetHorizontalAlignment.Left,
        verticalAlign: SheetVerticalAlignment.Top,
        stroke: 'black',
        strokeWidth: 2,
        lineDash: [1, 2],
      },
    );
    expect(node.x).toBe(1);
    expect(node.y).toBe(2);
    expect(node.width).toBe(3);
    expect(node.height).toBe(4);
    expect(node.top).toBe(5);
    expect(node.bottom).toBe(6);
    expect(node.left).toBe(7);
    expect(node.right).toBe(8);
    expect(node.horizontalAlign).toBe('left');
    expect(node.verticalAlign).toBe('top');
    expect(node.stroke).toBe('black');
    expect(node.strokeWidth).toBe(2);
    expect(node.lineDash).toEqual([1, 2]);
    expect(node.fill).toBe('');
    node.fill = 'red';
    expect(node.fill).toBe('red');
  });

  it('getNodeByRandomColorKey', () => {
    const node = new TestNode({ x: 0, y: 0, width: 10, height: 10 }, {});
    (node as any).randomColorKey = '#000';
    const hitColors = container.resolve<FakeHitColorRegistryProvider>(HitColorRegistry.symbol);
    hitColors.register('#000', node);
    expect(node.getNodeByRandomColorKey('#000')).toBe(node);
    expect(node.getNodeByRandomColorKey('#111')).toBeNull();
  });

  it('events', () => {
    const node = new TestNode({ x: 0, y: 0, width: 10, height: 10 }, {});
    const spy = jest.fn();
    node.addEventListener('test', spy);
    node.emit('test');
    expect(spy).toHaveBeenCalled();
    node.removeEventListener('test');
    node.emit('test');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('draw calls drawScene and drawHit', () => {
    const node = new TestNode({ x: 0, y: 0, width: 10, height: 10 }, {});
    node.drawScene = jest.fn();
    node.drawHit = jest.fn();
    node.draw({} as any, {} as any);
    expect(node.drawScene).toHaveBeenCalled();
    expect(node.drawHit).toHaveBeenCalled();
  });

  it('toJSON', () => {
    const node = new TestNode({ x: 0, y: 0, width: 10, height: 10 }, {});
    expect(node.toJSON()).toEqual({});
  });

  it('dispose collects all descendants and cleans them up', () => {
    const node = new TestNode({ x: 0, y: 0, width: 10, height: 10 }, {});
    const child = new TestNode({ x: 0, y: 0, width: 10, height: 10 }, {});
    const grandChild = new TestNode({ x: 0, y: 0, width: 10, height: 10 }, {});

    (child as any).randomColorKey = '#c1';
    (grandChild as any).randomColorKey = '#gc1';

    node.add(child);
    child.add(grandChild);

    const store = container.resolve<any>(Symbol.for('DataStorage'));
    expect(store.get(child.nodeKey)).toBe(child);
    expect(store.get(grandChild.nodeKey)).toBe(grandChild);

    node.dispose();

    expect(store.get(child.nodeKey)).toBeUndefined();
    expect(store.get(grandChild.nodeKey)).toBeUndefined();
    expect(node.childKeys.length).toBe(0);
  });

  it('dispose handles missing node from storage when keys are present', () => {
    const node = new TestNode({ x: 0, y: 0, width: 10, height: 10 }, {});
    (node as any).randomColorKey = '#abc';
    (node as any).childKeys = ['missing-node-key']; // fake a missing child

    // In DataStorage, missing-node-key is missing. Dispose should still be idempotent.
    expect(() => node.dispose()).not.toThrow();
  });

  it('removeChild handles non-existent child smoothly', () => {
    const node = new TestNode({ x: 0, y: 0, width: 10, height: 10 }, {});
    const child = new TestNode({ x: 0, y: 0, width: 10, height: 10 }, {});
    (child as any).randomColorKey = '#999';
    // child not added to node, so its key is not in childKeys
    expect(() => node.removeChild(child)).not.toThrow();
  });

  it('covers missing property branches and null randomColorKey branches', () => {
    const node = new TestNode();
    expect(node.stroke).toBe('');
    expect(node.strokeWidth).toBe(0);
    expect(node.lineDash).toBeUndefined();
    expect(node.fill).toBe('');

    // Force falsy randomColorKey for dispose coverage
    const child1 = new TestNode();
    node.add(child1);
    (child1 as any).randomColorKey = null;
    (node as any).randomColorKey = null;

    // Call dispose with null keys
    node.dispose();
  });

  it('disposes using stable node keys instead of hit color keys', () => {
    const parent = new TestNode({ x: 0, y: 0, width: 10, height: 10 }, {});
    const child = new TestNode({ x: 1, y: 1, width: 3, height: 3 }, {});
    (child as any).randomColorKey = '#release-fallback';
    parent.add(child);

    const store = container.resolve<any>(Symbol.for('DataStorage'));
    const originalGet = store.get.bind(store);
    store.get = jest.fn((key: string) => {
      const found = originalGet(key);
      return found;
    });

    expect(() => parent.dispose()).not.toThrow();
    expect(store.get).not.toHaveBeenCalledWith('#release-fallback');
  });
});
