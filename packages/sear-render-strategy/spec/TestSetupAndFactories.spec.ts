import './testSetup';
import {
  createDirtyTracker,
  createNode,
  createPositionRect,
  createRenderContext,
  createScrollManager,
  createTree,
} from './testFactories';

describe('render-strategy test setup helpers', () => {
  it('exposes mocked modules and helper methods from testSetup', () => {
    const diModule = jest.requireMock('@searsuite/sear-foundation-di') as {
      Inject: () => () => void;
      Injectable: () => (target: unknown) => unknown;
      container: { resolve: jest.Mock };
    };
    const contextModule = jest.requireMock('@searsuite/sear-render-context') as {
      RenderContext: new () => unknown;
    };
    const utilsModule = jest.requireMock('@searsuite/sear-foundation-utils') as {
      getRandomColor: () => string;
    };
    const storageModule = jest.requireMock('@searsuite/sear-foundation-storage') as {
      DataStorage: { symbol: symbol };
    };
    const rectModule = jest.requireMock('@searsuite/sear-foundation-rect') as {
      PositionRect: new (x: number, y: number, width: number, height: number) => { getSize(): [number, number] };
    };
    const nodeModule = jest.requireMock('@searsuite/sear-render-node') as {
      Tree: new () => { getBoundary(): unknown };
      GenerationalDirtyTracker: new (tree: unknown) => {
        query(range: unknown): unknown;
        getBoundary(): unknown;
        clear(): void;
      };
      Node: new () => {
        query(range: unknown): unknown;
        drawScene(context: unknown): void;
        drawHit(context: unknown): void;
        clear(context: unknown): void;
        getNodeByRandomColorKey(key: unknown): unknown;
      };
      FixBoxNode: new () => unknown;
      SceneGraph: new () => unknown;
      DirtyTree: new () => unknown;
    };

    expect(typeof diModule.container.resolve).toBe('function');
    diModule.container.resolve('x');
    const decorator = diModule.Injectable();
    class Sample {}
    expect(decorator(Sample)).toBe(Sample);
    expect(() => diModule.Inject()()).not.toThrow();

    const renderContext = new contextModule.RenderContext();
    expect(renderContext).toBeInstanceOf(contextModule.RenderContext);

    const tree = new nodeModule.Tree();
    expect(tree.getBoundary()).toEqual({ width: 1000, height: 800 });

    const dirtyTracker = new nodeModule.GenerationalDirtyTracker({});
    expect(dirtyTracker.query({})).toEqual([]);
    expect(dirtyTracker.getBoundary()).toEqual({ x: 0, y: 0, width: 1000, height: 800 });
    expect(() => dirtyTracker.clear()).not.toThrow();

    const node = new nodeModule.Node();
    expect(node.query({})).toEqual([]);
    expect(() => node.drawScene({})).not.toThrow();
    expect(() => node.drawHit({})).not.toThrow();
    expect(() => node.clear({})).not.toThrow();
    expect(node.getNodeByRandomColorKey('k')).toBeNull();

    expect(new nodeModule.FixBoxNode()).toBeInstanceOf(nodeModule.Node);
    expect(new nodeModule.SceneGraph()).toBeInstanceOf(nodeModule.SceneGraph);
    expect(new nodeModule.DirtyTree()).toBeInstanceOf(nodeModule.DirtyTree);
    expect(storageModule.DataStorage.symbol).toBe(Symbol.for('DataStorage'));
    expect(utilsModule.getRandomColor()).toBe('#abcdef');
    expect(new rectModule.PositionRect(1, 2, 3, 4).getSize()).toEqual([3, 4]);
  });

  it('builds test factory objects with callable APIs', () => {
    const renderContext = createRenderContext();
    renderContext.beginFrame();
    renderContext.beginNodeSemantics();
    renderContext.endNodeSemantics();
    renderContext.save();
    renderContext.restore();
    renderContext.setTransform();
    renderContext.clearRect();
    renderContext.drawImage();
    renderContext.getRenderTarget();
    renderContext.getImageData();
    renderContext.getMaxLineWidth();
    renderContext.getViewScale();
    renderContext.requiresFrameRebuild();
    renderContext.supportsDirtyRedraw();
    renderContext.requiresExplicitNodeClear();
    renderContext.resetHitFrame();

    const positionRect = createPositionRect(12, 34);
    expect(positionRect.getSize()).toEqual([12, 34]);
    expect(createPositionRect().getSize()).toEqual([100, 80]);

    const scrollManager = createScrollManager(22, 33);
    scrollManager.subscribeScroll();
    expect(scrollManager.getShape()).toEqual([22, 33]);
    expect(scrollManager.getPositionRect().getSize()).toEqual([22, 33]);

    const tree = createTree(77, 88);
    expect(tree.getBoundary()).toEqual({ width: 77, height: 88 });

    const dirtyTracker = createDirtyTracker([{ x: 1, y: 2, width: 3, height: 4 }]);
    expect(dirtyTracker.query()).toEqual([{ x: 1, y: 2, width: 3, height: 4 }]);
    expect(dirtyTracker.getBoundary()).toEqual({ x: 0, y: 0, width: 1000, height: 800 });
    dirtyTracker.clear();

    const node = createNode([{ id: 1 }]);
    expect(node.query()).toEqual([{ id: 1 }]);
    expect(node.getNodeByRandomColorKey()).toBeNull();
    expect(createNode().query()).toEqual([]);
  });
});
