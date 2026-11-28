import { PositionRect } from '@searsuite/sear-foundation-rect';
import { type HexColor } from '@searsuite/sear-foundation-utils';
import { type Node, type NodeProperties } from '@searsuite/sear-render-node';
import { type ScrollManagerState } from '@searsuite/sear-render-scroll';
import { BlockRasterCopyPlan, RasterCopyExecutor, ScreenRenderStrategy } from '../src';
import { createDirtyTracker, createRenderContext, createScrollManager, createTree } from './testFactories';
import './testSetup';

class TestScreenRenderStrategy extends ScreenRenderStrategy<NodeProperties> {
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

describe('ScreenRenderStrategy', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => void 0);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createStrategy = (isDrawn = false, scrollManager = createScrollManager(200, 100)) => {
    const renderContext = createRenderContext();
    const offScreenRenderContext = createRenderContext();
    offScreenRenderContext.isDrawn = isDrawn;

    const args = [
      renderContext,
      offScreenRenderContext,
      createRenderContext(),
      scrollManager,
      {},
      {},
      createTree(1000, 800),
      createDirtyTracker(),
      new RasterCopyExecutor(),
    ] as unknown as ConstructorParameters<typeof TestScreenRenderStrategy>;
    const strategy = new TestScreenRenderStrategy(...args);

    return strategy;
  };

  it('draws full visible scene on first paint and primes off-screen buffer', () => {
    const strategy = createStrategy(false);

    const visibleNode = { sticky: false, drawScene: jest.fn() };
    const stickyNode = { sticky: true, drawScene: jest.fn() };
    const overlayNode = {
      sticky: false,
      properties: { isEdit: true },
      drawScene: jest.fn(),
    };

    strategy.render(asNode({ query: jest.fn(() => [visibleNode, stickyNode, overlayNode]) }));

    expect(strategy.renderContext.clearRect).toHaveBeenCalled();
    expect(visibleNode.drawScene).toHaveBeenCalledTimes(1);
    expect(stickyNode.drawScene).not.toHaveBeenCalled();
    expect(overlayNode.drawScene).not.toHaveBeenCalled();
    expect(strategy.offScreenRenderContext.clearRect).toHaveBeenCalled();
    expect(strategy.offScreenRenderContext.drawImage).toHaveBeenCalled();
    expect(strategy.offScreenRenderContext.isDrawn).toBe(true);
  });

  it('defers scroll painting to the core frame coordinator', () => {
    expect(createStrategy().rendersThroughCoreScrollFrame()).toBe(false);
  });

  it('rebuilds retained render targets as a complete frame', () => {
    const strategy = createStrategy(true);
    (strategy.renderContext.requiresFrameRebuild as unknown as jest.Mock).mockReturnValue(true);
    const visibleNode = { sticky: false, drawScene: jest.fn() };
    const stickyNode = { sticky: true, drawScene: jest.fn() };
    const overlayNode = {
      sticky: false,
      properties: { isEdit: true },
      drawScene: jest.fn(),
    };

    strategy.render(asNode({ query: jest.fn(() => [visibleNode, stickyNode, overlayNode]) }));

    expect(strategy.renderContext.beginFrame as unknown as jest.Mock).toHaveBeenCalledTimes(1);
    expect(visibleNode.drawScene).toHaveBeenCalledTimes(1);
    expect(stickyNode.drawScene).not.toHaveBeenCalled();
    expect(overlayNode.drawScene).not.toHaveBeenCalled();
  });

  it('short-circuits when scroll does not change after off-screen is ready', () => {
    const strategy = createStrategy(true);
    strategy.setStates({ x: 5, y: 8, deltaX: 0, deltaY: 0 }, { x: 5, y: 8, deltaX: 0, deltaY: 0 });

    strategy.render(asNode({ query: jest.fn(() => []) }));

    expect(strategy.renderContext.drawImage).not.toHaveBeenCalled();
  });

  it('copies the cached viewport and redraws the newly exposed area after scroll', () => {
    const strategy = createStrategy(true);
    strategy.setStates({ x: 0, y: 0, deltaX: 0, deltaY: 0 }, { x: 10, y: 20, deltaX: -15, deltaY: 12 });

    const visibleNode = { sticky: false, drawScene: jest.fn() };
    const stickyNode = { sticky: true, drawScene: jest.fn() };

    strategy.render(asNode({ query: jest.fn(() => [visibleNode, stickyNode]) }));

    expect(strategy.renderContext.drawImage).toHaveBeenCalled();
    expect(visibleNode.drawScene).toHaveBeenCalledTimes(1);
    expect(stickyNode.drawScene).not.toHaveBeenCalled();
    expect(strategy.offScreenRenderContext.drawImage).toHaveBeenCalled();
  });

  it('repaints the whole viewport when a keyboard jump exceeds one screen', () => {
    const strategy = createStrategy(true);
    strategy.setStates({ x: 0, y: 0, deltaX: 0, deltaY: 0 }, { x: 0, y: 600, deltaX: 0, deltaY: -600 });
    const visibleNode = { sticky: false, drawScene: jest.fn() };
    const root = asNode({ query: jest.fn(() => [visibleNode]) });

    strategy.render(root);

    expect(strategy.renderContext.clearRect).toHaveBeenCalledWith(0, 0, 200, 100);
    expect(root.query).toHaveBeenCalledWith(new PositionRect(0, 600, 200, 100));
    expect(visibleNode.drawScene).toHaveBeenCalledTimes(1);
    expect(strategy.renderContext.drawImage).not.toHaveBeenCalled();
    expect(strategy.offScreenRenderContext.drawImage).toHaveBeenCalled();
  });

  it('copies reusable block rasters and redraws invalid layout regions', () => {
    const strategy = createStrategy(true);
    strategy.setStates({ x: 0, y: 0, deltaX: 0, deltaY: 0 }, { x: 0, y: 0, deltaX: 0, deltaY: 0 });
    const cacheTarget = {};
    (strategy.offScreenRenderContext.getRenderTarget as unknown as jest.Mock).mockReturnValue(cacheTarget);
    const invalidNode = { sticky: false, drawScene: jest.fn() };
    const root = asNode({ query: jest.fn(() => [invalidNode]) });
    const plan = new BlockRasterCopyPlan(
      new PositionRect(0, 0, 200, 100),
      [new PositionRect(0, 0, 200, 100)],
      [
        {
          source: { x: 0, y: 20, width: 200, height: 40 },
          destination: { x: 0, y: 40, width: 200, height: 40 },
        },
      ],
      [new PositionRect(0, 0, 200, 20)],
    );

    strategy.configureRuntime({
      getViewport: () => new PositionRect(0, 0, 200, 100),
      consumeBlockRasterCopyPlan: jest.fn(() => plan),
    });

    strategy.render(root);

    expect(strategy.renderContext.clearRect).toHaveBeenCalledWith(0, 0, 200, 100);
    expect(strategy.renderContext.drawImage).toHaveBeenCalledWith(cacheTarget, 0, 40, 200, 40, 0, 20, 200, 40);
    expect(invalidNode.drawScene).toHaveBeenCalledTimes(1);
    expect(strategy.offScreenRenderContext.drawImage).toHaveBeenCalled();
  });

  it('uses ScrollManager render-scroll state for deferred scroll frames', () => {
    const scrollManager = {
      ...createScrollManager(200, 100),
      getRenderScrollState: jest.fn(() => ({ x: 24, y: 32, deltaX: -24, deltaY: -32 })),
      hasUnrenderedScroll: jest.fn(() => true),
      markScrollStateRendered: jest.fn(),
    };
    const strategy = createStrategy(true, scrollManager);
    strategy.setStates({ x: 24, y: 32, deltaX: 0, deltaY: 0 }, { x: 24, y: 32, deltaX: 0, deltaY: 0 });

    const visibleNode = { sticky: false, drawScene: jest.fn() };

    strategy.render(asNode({ query: jest.fn(() => [visibleNode]) }));

    expect(strategy.renderContext.drawImage).toHaveBeenCalled();
    expect(visibleNode.drawScene).toHaveBeenCalledTimes(1);
    expect(scrollManager.markScrollStateRendered).toHaveBeenCalledTimes(1);
  });

  it('handles positive horizontal and negative vertical deltas in one scroll frame', () => {
    const strategy = createStrategy(true);
    strategy.setStates({ x: 0, y: 0, deltaX: 0, deltaY: 0 }, { x: 4, y: 6, deltaX: 8, deltaY: -6 });

    const visibleNode = { sticky: false, drawScene: jest.fn() };

    strategy.render(asNode({ query: jest.fn(() => [visibleNode]) }));

    expect(strategy.renderContext.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, -4, -6);
    expect(visibleNode.drawScene).toHaveBeenCalled();
  });

  it('handles vertical-only scroll where horizontal delta is zero', () => {
    const strategy = createStrategy(true);
    strategy.setStates({ x: 0, y: 0, deltaX: 0, deltaY: 0 }, { x: 2, y: 3, deltaX: 0, deltaY: 10 });

    const visibleNode = { sticky: false, drawScene: jest.fn() };

    strategy.render(asNode({ query: jest.fn(() => [visibleNode]) }));

    expect(strategy.renderContext.drawImage).toHaveBeenCalled();
    expect(visibleNode.drawScene).toHaveBeenCalled();
  });

  it('covers origin fallback branches while still rendering a changed scroll frame', () => {
    const strategy = createStrategy(true);
    strategy.setStates({ x: 1, y: 1, deltaX: 0, deltaY: 0 }, { x: 0, y: 0, deltaX: 0, deltaY: 0 });

    const visibleNode = { sticky: false, drawScene: jest.fn() };

    strategy.render(asNode({ query: jest.fn(() => [visibleNode]) }));

    expect(strategy.renderContext.drawImage).toHaveBeenCalled();
    expect(visibleNode.drawScene).toHaveBeenCalled();
  });

  it('covers upward-left scroll branch with negative deltas', () => {
    const strategy = createStrategy(true);
    strategy.setStates({ x: 2, y: 3, deltaX: 0, deltaY: 0 }, { x: 0, y: 0, deltaX: -5, deltaY: -7 });

    const visibleNode = { sticky: false, drawScene: jest.fn() };

    strategy.render(asNode({ query: jest.fn(() => [visibleNode]) }));

    expect(strategy.renderContext.drawImage).toHaveBeenCalled();
    expect(visibleNode.drawScene).toHaveBeenCalled();
  });

  it('returns render context and keeps coordinate lookup unimplemented', () => {
    const strategy = createStrategy(false);

    expect(strategy.getContext()).toBe(strategy.renderContext);
    expect(() => strategy.getNodeByCoordinates(asNode({}), 8, 9)).toThrow(
      'ScreenRenderStrategy.getNodeByCoordinates is not supported; use HitRenderStrategy for coordinate lookup.',
    );
  });

  it('keeps non-edit nodes with explicit properties during blank-area redraw', () => {
    const strategy = createStrategy(true);
    strategy.setStates({ x: 0, y: 0, deltaX: 0, deltaY: 0 }, { x: 6, y: 4, deltaX: 5, deltaY: 3 });

    const nodeWithProps = {
      sticky: false,
      properties: { isEdit: false },
      drawScene: jest.fn(),
    };

    strategy.render(asNode({ query: jest.fn(() => [nodeWithProps]) }));

    expect(nodeWithProps.drawScene).toHaveBeenCalledTimes(1);
  });

  it('supports host-provided viewport, world mapping, node query, and drawing hooks', () => {
    const strategy = createStrategy(true);
    strategy.setStates({ x: 0, y: 0, deltaX: 0, deltaY: 0 }, { x: 30, y: 40, deltaX: -8, deltaY: 0 });
    const visibleNode = { sticky: false, drawScene: jest.fn() };
    const root = asNode({ query: jest.fn(() => [visibleNode]) });
    const queryNodes = jest.fn<readonly Node<NodeProperties>[], [Node<NodeProperties>, PositionRect<HexColor>]>(() => [
      visibleNode as unknown as Node<NodeProperties>,
    ]);
    const drawNodes = jest.fn((input: { readonly nodes: readonly Node<NodeProperties>[] }) => {
      const { nodes } = input;
      nodes.forEach((node) => node.drawScene(strategy.renderContext, new PositionRect(0, 0, 1, 1)));
    });

    strategy.configureRuntime({
      getViewport: () => new PositionRect(12, 16, 200, 100),
      toWorldRect: (viewportRect, scrollState) =>
        new PositionRect(
          viewportRect.x - 12 + scrollState.x,
          viewportRect.y - 16 + scrollState.y,
          viewportRect.width,
          viewportRect.height,
        ),
      queryNodes,
      drawNodes,
    });

    strategy.render(root);

    expect(queryNodes.mock.calls[0][1]).toEqual(expect.objectContaining({ x: 222, y: 40, width: 8, height: 100 }));
    expect(drawNodes).toHaveBeenCalledTimes(1);
    expect(visibleNode.drawScene).toHaveBeenCalledTimes(1);
  });
});
