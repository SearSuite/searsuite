jest.mock('@searsuite/sear-foundation-di', () => ({
  Inject: () => () => void 0,
  Injectable: () => (target: unknown) => target,
  container: { resolve: jest.fn() },
}));

jest.mock('@searsuite/sear-foundation-storage', () => ({
  DataStorage: { symbol: Symbol.for('DataStorage') },
}));

jest.mock('@searsuite/sear-foundation-utils', () => ({
  HexColor: String,
  getRandomColor: () => '#abcdef',
}));

jest.mock('@searsuite/sear-assembly-config', () => ({
  ConfigEngine: { symbol: Symbol.for('ConfigEngine') },
}));

jest.mock('@searsuite/sear-render-registry', () => ({
  RenderCoordinatorManager: { symbol: Symbol.for('RenderCoordinatorManager') },
}));

jest.mock('@searsuite/sear-foundation-rect', () => ({
  PositionRect: class PositionRect<T = unknown> {
    constructor(public x: number, public y: number, public width: number, public height: number, public value?: T) {}

    getSize(): [number, number] {
      return [this.width, this.height];
    }
  },
}));

jest.mock('@searsuite/sear-render-context', () => {
  class RenderContext {
    static readonly symbol = Symbol.for('RenderContext');
    static readonly offScreenSymbol = Symbol.for('RenderContext.OffScreen');
    static readonly hitSymbol = Symbol.for('RenderContext.Hit');
  }

  return {
    RenderContext,
  };
});

jest.mock('@searsuite/sear-render-scroll', () => ({
  ScrollManager: { symbol: Symbol.for('ScrollManager') },
  createDefaultScrollManagerState: () => ({ x: 0, y: 0, deltaX: 0, deltaY: 0 }),
}));

jest.mock('@searsuite/sear-render-node', () => {
  class SceneGraph<T = unknown> {
    static symbol = Symbol.for('SceneGraph');
  }

  class Tree<T = unknown> {
    static symbol = Symbol.for('Tree');

    getBoundary() {
      return { width: 1000, height: 800 };
    }
  }

  class GenerationalDirtyTracker {
    static symbol = Symbol.for('GenerationalDirtyTracker');

    query() {
      return [];
    }

    getBoundary() {
      return { x: 0, y: 0, width: 1000, height: 800 };
    }

    clear() {}
  }

  class DirtyTree {}

  class Node<T = unknown> {
    sticky = false;
    depth = 0;

    query() {
      return [] as Array<Node<T>>;
    }

    drawScene() {}

    drawHit() {}

    clear() {}

    getNodeByRandomColorKey() {
      return null;
    }
  }

  class FixBoxNode<T = unknown> extends Node<T> {}

  return {
    SceneGraph,
    Tree,
    GenerationalDirtyTracker,
    DirtyTree,
    Node,
    FixBoxNode,
  };
});
