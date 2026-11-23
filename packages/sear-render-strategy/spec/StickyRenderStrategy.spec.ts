import './testSetup';
import { StickyRenderStrategy } from '../src/StickyRenderStrategy';
import { type Node, type NodeProperties } from '@searsuite/sear-render-node';
import { type ScrollManagerState } from '@searsuite/sear-render-scroll';
import { createDirtyTracker, createRenderContext, createScrollManager, createTree } from './testFactories';

class TestStickyRenderStrategy extends StickyRenderStrategy<NodeProperties> {
  setScrollState(scrollState: ScrollManagerState): void {
    this.scrollState = scrollState;
  }

  rendersThroughCoreScrollFrame(): boolean {
    return this.shouldRenderOnScroll();
  }
}

function asNode(value: object): Node<NodeProperties> {
  return value as unknown as Node<NodeProperties>;
}

describe('StickyRenderStrategy', () => {
  const createStrategy = () => {
    const args = [
      createRenderContext(),
      createRenderContext(),
      createRenderContext(),
      createScrollManager(200, 100),
      {},
      {},
      {},
      createTree(1000, 800),
      createDirtyTracker(),
    ] as unknown as ConstructorParameters<typeof TestStickyRenderStrategy>;
    const strategy = new TestStickyRenderStrategy(...args);
    strategy.setScrollState({ x: 12, y: 18, deltaX: 0, deltaY: 0 });
    return strategy;
  };

  it('renders left/top/corner sticky groups with corresponding transforms', () => {
    const strategy = createStrategy();

    const leftSticky = {
      sticky: true,
      left: 0,
      top: void 0,
      clear: jest.fn(),
      drawScene: jest.fn(),
    };
    const topSticky = {
      sticky: true,
      left: void 0,
      top: 0,
      clear: jest.fn(),
      drawScene: jest.fn(),
    };
    const cornerSticky = {
      sticky: true,
      left: 0,
      top: 0,
      clear: jest.fn(),
      drawScene: jest.fn(),
    };
    const nonSticky = {
      sticky: false,
      left: 0,
      top: 0,
      clear: jest.fn(),
      drawScene: jest.fn(),
    };

    strategy.render(
      asNode({
        query: jest.fn(() => [leftSticky, topSticky, cornerSticky, nonSticky]),
      }),
    );

    expect(leftSticky.drawScene).toHaveBeenCalledTimes(1);
    expect(topSticky.drawScene).toHaveBeenCalledTimes(1);
    expect(cornerSticky.drawScene).toHaveBeenCalledTimes(1);
    expect(nonSticky.drawScene).not.toHaveBeenCalled();

    expect(strategy.renderContext.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, -18);
    expect(strategy.renderContext.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, -12, 0);
    expect(strategy.renderContext.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
  });

  it('defers sticky painting to the core frame coordinator', () => {
    expect(createStrategy().rendersThroughCoreScrollFrame()).toBe(false);
  });

  it('skips drawing when there is no sticky node in the visible query', () => {
    const strategy = createStrategy();

    strategy.render(asNode({ query: jest.fn(() => []) }));

    expect(strategy.renderContext.save).not.toHaveBeenCalled();
  });

  it('returns render context and keeps coordinate lookup unimplemented', () => {
    const strategy = createStrategy();

    expect(strategy.getContext()).toBe(strategy.renderContext);
    expect(() => strategy.getNodeByCoordinates(asNode({}), 3, 4)).toThrow(
      'StickyRenderStrategy.getNodeByCoordinates is not supported; use HitRenderStrategy for coordinate lookup.',
    );
  });

  it('draws sticky nodes without clearing when explicit node clear is not required', () => {
    const strategy = createStrategy();
    (strategy.renderContext.requiresExplicitNodeClear as unknown as jest.Mock).mockReturnValue(false);

    const stickyNode = {
      sticky: true,
      left: 0,
      top: void 0,
      clear: jest.fn(),
      drawScene: jest.fn(),
    };

    strategy.render(asNode({ query: jest.fn(() => [stickyNode]) }));

    expect(stickyNode.drawScene).toHaveBeenCalledTimes(1);
    expect(stickyNode.clear).not.toHaveBeenCalled();
  });

  it('leaves fixed-row edit overlays to the final pass without clearing the cell beneath', () => {
    const strategy = createStrategy();
    const fixedCell = {
      sticky: true,
      left: void 0,
      top: 24,
      properties: { isEdit: false },
      clear: jest.fn(),
      drawScene: jest.fn(),
    };
    const selectionOutline = {
      sticky: true,
      left: void 0,
      top: 24,
      properties: { isEdit: true },
      clear: jest.fn(),
      drawScene: jest.fn(),
    };

    strategy.render(asNode({ query: jest.fn(() => [fixedCell, selectionOutline]) }));

    expect(fixedCell.clear).toHaveBeenCalledTimes(1);
    expect(fixedCell.drawScene).toHaveBeenCalledTimes(1);
    expect(selectionOutline.clear).not.toHaveBeenCalled();
    expect(selectionOutline.drawScene).not.toHaveBeenCalled();
  });
});
