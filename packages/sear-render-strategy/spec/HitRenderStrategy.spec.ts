import { FixBoxNode, type Node, type NodeProperties } from '@searsuite/sear-render-node';
import { HitRenderStrategy } from '../src/HitRenderStrategy';
import { createDirtyTracker, createRenderContext, createScrollManager, createTree } from './testFactories';
import './testSetup';

class TestHitRenderStrategy extends HitRenderStrategy<NodeProperties> {
  setScrollState(x: number | undefined, y: number | undefined): void {
    this.scrollState = { x: x ?? 0, y: y ?? 0, deltaX: 0, deltaY: 0 };
  }
  setPendingNode(node: Node<NodeProperties> | null): void {
    this.pendingNode = node;
  }
  get timer(): number | null {
    return this.renderDebounceTimer;
  }
  get pendingScroll(): Node<NodeProperties> | null {
    return this.pendingScrollNode;
  }
  get hitContextForTest() {
    return this.hitRenderContext;
  }
  get platformForTest() {
    return this.platform;
  }
}

function asNode(value: object): Node<NodeProperties> {
  return value as unknown as Node<NodeProperties>;
}

describe('HitRenderStrategy', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'log').mockImplementation(() => void 0);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const createStrategy = () => {
    const hitRenderContext = createRenderContext();
    const args = [
      createRenderContext(),
      createRenderContext(),
      hitRenderContext,
      createScrollManager(100, 80),
      {},
      {},
      createTree(1000, 800),
      createDirtyTracker(),
      {
        setTimeout: (cb: () => void, ms: number) => setTimeout(cb, ms),
        clearTimeout: (h: number) => clearTimeout(h),
      },
    ] as unknown as ConstructorParameters<typeof TestHitRenderStrategy>;
    const strategy = new TestHitRenderStrategy(...args);

    strategy.setScrollState(7, 9);
    return strategy;
  };

  it('returns matched node by reading opaque hit-canvas pixels', () => {
    const strategy = createStrategy();

    (strategy.hitContextForTest.getImageData as unknown as jest.Mock).mockReturnValue({
      data: [
        [10, 20, 30, 255],
        [1, 2, 3, 0],
      ],
    });

    const expectedNode = { id: 'target' };
    const root = {
      getNodeByRandomColorKey: jest.fn((key: string) => (key === '#0a141e' ? expectedNode : null)),
    };

    expect(strategy.getNodeByCoordinates(asNode(root), 4, 5)).toEqual([expectedNode]);
  });

  it('returns an empty list when pixel cannot be mapped or image data is missing', () => {
    const strategy = createStrategy();

    (strategy.hitContextForTest.getImageData as unknown as jest.Mock).mockReturnValue(void 0);
    expect(strategy.getNodeByCoordinates(asNode({ getNodeByRandomColorKey: jest.fn() }), 1, 1)).toEqual([]);

    (strategy.hitContextForTest.getImageData as unknown as jest.Mock).mockReturnValue({ data: [[1, 2, 3, 255]] });
    expect(strategy.getNodeByCoordinates(asNode({ getNodeByRandomColorKey: jest.fn(() => null) }), 1, 1)).toEqual([]);
  });

  it('debounces hit rendering and keeps only the last requested node', () => {
    const strategy = createStrategy();
    const debouncedRender = jest.spyOn(strategy, 'debouncedRender').mockImplementation(() => void 0);

    strategy.render(asNode({ id: 'A' }), 50);
    strategy.render(asNode({ id: 'B' }), 50);

    jest.advanceTimersByTime(50);

    expect(debouncedRender).toHaveBeenCalledTimes(1);
    expect(debouncedRender).toHaveBeenCalledWith({ id: 'B' });
  });

  it('uses default debounce delay when delay is omitted', () => {
    const strategy = createStrategy();
    const debouncedRender = jest.spyOn(strategy, 'debouncedRender').mockImplementation(() => void 0);

    strategy.render(asNode({ id: 'default-delay' }));
    jest.advanceTimersByTime(99);
    expect(debouncedRender).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(debouncedRender).toHaveBeenCalledTimes(1);
  });

  it('cancels pending hit render when a new one arrives before timeout', () => {
    const strategy = createStrategy();
    const debouncedRender = jest.spyOn(strategy, 'debouncedRender').mockImplementation(() => void 0);

    strategy.render(asNode({ id: 'first' }), 40);
    strategy.render(asNode({ id: 'second' }), 40);

    jest.advanceTimersByTime(39);
    expect(debouncedRender).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(debouncedRender).toHaveBeenCalledWith({ id: 'second' });
  });

  it('handles boot-time frame where scroll state is partially initialized', () => {
    const strategy = createStrategy();
    const fixNode = Object.create(FixBoxNode.prototype) as FixBoxNode<NodeProperties>;
    fixNode.properties = {};
    fixNode.drawHit = jest.fn();

    strategy.setScrollState(void 0, void 0);

    strategy.debouncedRender(asNode({ query: jest.fn(() => [fixNode]) }));

    expect(strategy.hitContextForTest.resetHitFrame).toHaveBeenCalledWith(100, 80);
    expect(fixNode.drawHit).toHaveBeenCalledTimes(1);
  });

  it('draws hit-enabled nodes and skips visual-only nodes on the hit layer', () => {
    const strategy = createStrategy();

    const fixNode = Object.create(FixBoxNode.prototype) as FixBoxNode<NodeProperties>;
    fixNode.properties = {};
    fixNode.drawHit = jest.fn();

    const customNode = {
      properties: {},
      drawHit: jest.fn(),
    };
    const visualOnlyNode = {
      properties: { skipHit: true },
      drawHit: jest.fn(),
    };

    strategy.debouncedRender(asNode({ query: jest.fn(() => [fixNode, customNode, visualOnlyNode]) }));

    expect(fixNode.drawHit).toHaveBeenCalledTimes(1);
    expect(customNode.drawHit).toHaveBeenCalledTimes(1);
    expect(visualOnlyNode.drawHit).not.toHaveBeenCalled();
  });

  it('keeps debounce timer cleanup even when pending node is cleared externally', () => {
    const strategy = createStrategy();
    const debouncedRender = jest.spyOn(strategy, 'debouncedRender').mockImplementation(() => void 0);

    strategy.render(asNode({ id: 'pending' }), 20);
    strategy.setPendingNode(null);

    jest.advanceTimersByTime(20);

    expect(debouncedRender).not.toHaveBeenCalled();
    expect(strategy.timer).toBeNull();
  });

  it('coalesces scroll hit redraws into one animation frame using the latest node', () => {
    const strategy = createStrategy();
    const renderImmediate = jest.spyOn(strategy, 'renderImmediate').mockImplementation(() => void 0);
    let frameCallback: FrameRequestCallback | undefined;
    strategy.platformForTest.requestAnimationFrame = jest.fn((callback: FrameRequestCallback) => {
      frameCallback = callback;
      return 1;
    });

    strategy.renderOnNextFrame(asNode({ id: 'first' }));
    strategy.renderOnNextFrame(asNode({ id: 'latest' }));

    expect(strategy.platformForTest.requestAnimationFrame).toHaveBeenCalledTimes(1);
    frameCallback?.(0);
    expect(renderImmediate).toHaveBeenCalledTimes(1);
    expect(renderImmediate).toHaveBeenCalledWith({ id: 'latest' });
  });

  it('does nothing when animation frame fires after pending scroll node was cleared', () => {
    const strategy = createStrategy();
    const renderImmediate = jest.spyOn(strategy, 'renderImmediate').mockImplementation(() => void 0);
    let frameCallback: FrameRequestCallback | undefined;
    strategy.platformForTest.requestAnimationFrame = jest.fn((callback: FrameRequestCallback) => {
      frameCallback = callback;
      return 2;
    });

    strategy.renderOnNextFrame(asNode({ id: 'to-clear' }));
    (strategy as any).pendingScrollNode = null;
    frameCallback?.(0);

    expect(renderImmediate).not.toHaveBeenCalled();
  });

  it('flushes a pending scroll redraw before pointer hit testing', () => {
    const strategy = createStrategy();
    const renderImmediate = jest.spyOn(strategy, 'renderImmediate').mockImplementation(() => void 0);
    strategy.platformForTest.requestAnimationFrame = jest.fn(() => 12);
    strategy.platformForTest.cancelAnimationFrame = jest.fn();

    strategy.renderOnNextFrame(asNode({ id: 'latest' }));
    strategy.flushPendingScrollRender();

    expect(strategy.platformForTest.cancelAnimationFrame).toHaveBeenCalledWith(12);
    expect(renderImmediate).toHaveBeenCalledWith({ id: 'latest' });
    expect(strategy.pendingScroll).toBeNull();
  });

  it('flushes pending scroll redraw without cancel when no frame handle exists', () => {
    const strategy = createStrategy();
    const renderImmediate = jest.spyOn(strategy, 'renderImmediate').mockImplementation(() => void 0);
    strategy.platformForTest.cancelAnimationFrame = jest.fn();

    (strategy as any).pendingScrollNode = asNode({ id: 'manual' });
    (strategy as any).scrollFrameHandle = null;
    strategy.flushPendingScrollRender();

    expect(strategy.platformForTest.cancelAnimationFrame).not.toHaveBeenCalled();
    expect(renderImmediate).toHaveBeenCalledWith({ id: 'manual' });
  });

  it('returns the hit render context', () => {
    const strategy = createStrategy();

    expect(strategy.getContext()).toBe(strategy.hitContextForTest);
  });
});
