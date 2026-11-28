import { type Node, type NodeProperties } from '@searsuite/sear-render-node';
import { type ScrollManagerState } from '@searsuite/sear-render-scroll';
import { DirtyRegionCollector } from '../src/DirtyRegionCollector';
import { DirtyRenderStrategy } from '../src/DirtyRenderStrategy';
import { createDirtyTracker, createRenderContext, createScrollManager, createTree } from './testFactories';
import './testSetup';

class TestDirtyRenderStrategy extends DirtyRenderStrategy<NodeProperties> {
  setStates(previous: ScrollManagerState, current: ScrollManagerState): void {
    this.previousScrollState = previous;
    this.scrollState = current;
  }

  rendersThroughCoreScrollFrame(): boolean {
    return this.shouldRenderOnScroll();
  }
}

function asNode(value: object): Node<NodeProperties> {
  return value as unknown as Node<NodeProperties>;
}

describe('DirtyRenderStrategy', () => {
  const createStrategy = (dirtyRects: Array<{ x: number; y: number; width: number; height: number }>) => {
    const args = [
      createRenderContext(),
      createRenderContext(),
      createRenderContext(),
      createScrollManager(),
      {},
      {},
      createTree(),
      createDirtyTracker(dirtyRects),
    ] as unknown as ConstructorParameters<typeof TestDirtyRenderStrategy>;
    const strategy = new TestDirtyRenderStrategy(...args);
    strategy.setStates({ x: 2, y: 3, deltaX: 0, deltaY: 0 }, { x: 5, y: 6, deltaX: 0, deltaY: 0 });

    return strategy;
  };

  it('returns early when there are no dirty rectangles', () => {
    const strategy = createStrategy([]);

    strategy.render(asNode({ query: jest.fn(() => []) }));

    expect(strategy.dirtyTree.clear).not.toHaveBeenCalled();
  });

  it('does not run the dirty pass directly from scroll events', () => {
    expect(createStrategy([]).rendersThroughCoreScrollFrame()).toBe(false);
  });

  it('clears dirty state without drawing when the target has no dirty redraw support', () => {
    const strategy = createStrategy([{ x: 0, y: 0, width: 10, height: 10 }]);
    (strategy.renderContext.supportsDirtyRedraw as unknown as jest.Mock).mockReturnValue(false);

    strategy.render(asNode({ query: jest.fn(() => []) }));

    expect(strategy.dirtyTree.clear).toHaveBeenCalledTimes(1);
    expect(strategy.renderContext.clearRect).not.toHaveBeenCalled();
  });

  it('redraws non-sticky nodes intersecting dirty regions and clears tracker', () => {
    const strategy = createStrategy([
      { x: 10, y: 20, width: 30, height: 40 },
      { x: 50, y: 60, width: 10, height: 15 },
    ]);

    const depth2 = { depth: 2, sticky: false, drawScene: jest.fn() };
    const depth1 = { depth: 1, sticky: false, drawScene: jest.fn() };
    const sticky = { depth: 0, sticky: true, drawScene: jest.fn() };

    const root = {
      query: jest.fn(() => [depth2, depth1, sticky]),
    };

    strategy.render(asNode(root));

    expect(strategy.renderContext.clearRect).toHaveBeenCalled();
    expect(strategy.offScreenRenderContext.clearRect).toHaveBeenCalled();
    // A dirty rect is cleared from the frame currently on screen. During a
    // scroll this must use current, not previous, world-to-view offset.
    expect(strategy.renderContext.clearRect).toHaveBeenCalledWith(4, 13, 32, 42);
    expect(depth2.drawScene).toHaveBeenCalled();
    expect(depth1.drawScene).toHaveBeenCalled();
    expect(sticky.drawScene).not.toHaveBeenCalled();
    expect(strategy.dirtyTree.clear).toHaveBeenCalledTimes(1);
  });

  it('returns render context and keeps coordinate lookup unimplemented', () => {
    const strategy = createStrategy([]);

    expect(strategy.getContext()).toBe(strategy.renderContext);
    expect(() => strategy.getNodeByCoordinates(asNode({}), 0, 0)).toThrow(
      'DirtyRenderStrategy.getNodeByCoordinates is not supported; use HitRenderStrategy for coordinate lookup.',
    );
  });

  it('uses a union clip for selection nodes and excludes edit nodes', () => {
    const strategy = createStrategy([{ x: 10, y: 10, width: 20, height: 20 }]);
    const selection = {
      x: 0,
      y: 0,
      width: 40,
      height: 40,
      depth: 1,
      sticky: false,
      strokeWidth: 4,
      properties: { shouldBeClipInDirtyRender: true },
      drawScene: jest.fn(),
    };
    const edit = {
      x: 10,
      y: 10,
      width: 10,
      height: 10,
      depth: 0,
      sticky: false,
      properties: { isEdit: true },
      drawScene: jest.fn(),
    };

    strategy.render(asNode({ query: jest.fn(() => [selection, edit]) }));

    expect(selection.drawScene).toHaveBeenCalledTimes(2);
    expect(selection.drawScene.mock.calls[0][1]).toEqual(
      expect.arrayContaining([expect.arrayContaining([-2, -2]), expect.arrayContaining([42, 42])]),
    );
    expect(edit.drawScene).not.toHaveBeenCalled();
  });

  it('normalizes duplicate, collinear, and degenerate union-boundary geometry', () => {
    const originalGet = Map.prototype.get;
    try {
      Map.prototype.get = function getPossiblyMissingNextPoint(key) {
        if (this.size > 0 && typeof key === 'string') {
          return undefined; // force !next branch
        }
        return originalGet.call(this, key);
      };

      expect(
        DirtyRegionCollector.traceUnionBoundary({ x1: 0, y1: 0, x2: 1, y2: 1 }, { x1: 0, y1: 0, x2: 1, y2: 1 }),
      ).toEqual([[0, 0]]);
    } finally {
      Map.prototype.get = originalGet;
    }

    expect(
      DirtyRegionCollector.dedupePoints([
        [0, 0],
        [0, 0],
        [1, 1],
      ]),
    ).toEqual([
      [0, 0],
      [1, 1],
    ]);
    expect(
      DirtyRegionCollector.removeCollinear([
        [0, 0],
        [1, 0],
        [2, 0],
      ]),
    ).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
    expect(
      DirtyRegionCollector.removeCollinear([
        [0, 0],
        [1, 1],
      ]),
    ).toEqual([
      [0, 0],
      [1, 1],
    ]);
    expect(
      DirtyRegionCollector.traceUnionBoundary({ x1: 0, y1: 0, x2: 0, y2: 1 }, { x1: 0, y1: 0, x2: 0, y2: 1 }),
    ).toEqual([
      [0, 0],
      [0, 0],
      [0, 1],
      [0, 1],
    ]);
    expect(
      DirtyRegionCollector.traceUnionBoundary({ x1: 2, y1: 0, x2: 0, y2: 1 }, { x1: 2, y1: 0, x2: 0, y2: 1 }),
    ).toEqual([
      [2, 0],
      [0, 0],
      [0, 1],
      [2, 1],
    ]);
  });
});
