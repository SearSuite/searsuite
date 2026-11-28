import { type Node, type NodeProperties } from '@searsuite/sear-render-node';
import { type ScrollManagerState } from '@searsuite/sear-render-scroll';
import { OverlayRenderStrategy } from '../src/OverlayRenderStrategy';
import { createDirtyTracker, createRenderContext, createScrollManager, createTree } from './testFactories';
import './testSetup';

class TestOverlayRenderStrategy extends OverlayRenderStrategy<NodeProperties> {
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

describe('OverlayRenderStrategy', () => {
  const createStrategy = () => {
    const args = [
      createRenderContext(),
      createRenderContext(),
      createRenderContext(),
      createScrollManager(200, 100),
      {},
      {},
      createTree(1000, 800),
      createDirtyTracker(),
    ] as unknown as ConstructorParameters<typeof TestOverlayRenderStrategy>;
    const strategy = new TestOverlayRenderStrategy(...args);
    strategy.setScrollState({ x: 12, y: 18, deltaX: 0, deltaY: 0 });
    return strategy;
  };

  it('does not change the render context when the visible query has no edit nodes', () => {
    const strategy = createStrategy();
    const nonEdit = { properties: {}, drawScene: jest.fn() };

    strategy.render(asNode({ query: jest.fn(() => [nonEdit]) }));

    expect(nonEdit.drawScene).not.toHaveBeenCalled();
    expect(strategy.renderContext.save).not.toHaveBeenCalled();
  });

  it('defers overlay painting to the core frame coordinator', () => {
    expect(createStrategy().rendersThroughCoreScrollFrame()).toBe(false);
  });

  it('draws only edit nodes in world coordinates and scopes their semantic metadata', () => {
    const strategy = createStrategy();
    const clippedEdit = {
      properties: {
        isEdit: true,
        overlayClipRect: { x: 20, y: 30, width: 40, height: 50 },
        semanticOwner: 'cell-editor',
        semanticRole: 'editor',
      },
      drawScene: jest.fn(),
    };
    const visibleEdit = {
      properties: { isEdit: true },
      drawScene: jest.fn(),
    };
    const nonEdit = { properties: {}, drawScene: jest.fn() };

    strategy.render(asNode({ query: jest.fn(() => [nonEdit, clippedEdit, visibleEdit]) }));

    expect(nonEdit.drawScene).not.toHaveBeenCalled();
    expect(clippedEdit.drawScene).toHaveBeenCalledWith(
      strategy.renderContext,
      expect.objectContaining({ x: 20, y: 30, width: 40, height: 50 }),
    );
    expect(visibleEdit.drawScene).toHaveBeenCalledWith(
      strategy.renderContext,
      expect.objectContaining({ x: 12, y: 18, width: 200, height: 100 }),
    );
    expect(strategy.renderContext.beginNodeSemantics).toHaveBeenNthCalledWith(1, {
      owner: 'cell-editor',
      role: 'editor',
    });
    expect(strategy.renderContext.beginNodeSemantics).toHaveBeenNthCalledWith(2, {
      owner: void 0,
      role: void 0,
    });
    expect(strategy.renderContext.endNodeSemantics).toHaveBeenCalledTimes(2);
    expect(strategy.renderContext.setTransform).toHaveBeenNthCalledWith(1, 1, 0, 0, 1, -12, -18);
    expect(strategy.renderContext.setTransform).toHaveBeenLastCalledWith(1, 0, 0, 1, 0, 0);
    expect(strategy.renderContext.restore).toHaveBeenCalledTimes(1);
  });

  it('paints selected document text after the selection background', () => {
    const strategy = createStrategy();
    const draws: string[] = [];
    const selection = {
      properties: { isEdit: true, semanticOwner: 'rich-text', semanticRole: 'selection' },
      getSelectionRects: () => [{ x: 20, y: 30, width: 80, height: 20 }],
      drawScene: jest.fn(() => draws.push('selection')),
    };
    const block = {
      properties: { semanticOwner: 'rich-text', semanticRole: 'block' },
      drawScene: jest.fn(() => draws.push('text')),
    };

    strategy.render(asNode({ query: jest.fn(() => [block, selection]) }));

    expect(draws).toEqual(['selection', 'text']);
    expect(strategy.renderContext.rect).toHaveBeenCalledWith(20, 30, 80, 20);
    expect(strategy.renderContext.clip).toHaveBeenCalledTimes(1);
  });

  it('restores semantic state and the render context when an overlay draw fails', () => {
    const strategy = createStrategy();
    const error = new Error('draw failed');
    const edit = {
      properties: { isEdit: true },
      drawScene: jest.fn(() => {
        throw error;
      }),
    };

    expect(() => strategy.render(asNode({ query: jest.fn(() => [edit]) }))).toThrow(error);
    expect(strategy.renderContext.endNodeSemantics).toHaveBeenCalledTimes(1);
    expect(strategy.renderContext.setTransform).toHaveBeenLastCalledWith(1, 0, 0, 1, 0, 0);
    expect(strategy.renderContext.restore).toHaveBeenCalledTimes(1);
  });

  it('returns its context and rejects coordinate lookup', () => {
    const strategy = createStrategy();

    expect(strategy.getContext()).toBe(strategy.renderContext);
    expect(() => strategy.getNodeByCoordinates(asNode({}), 3, 4)).toThrow(
      'OverlayRenderStrategy.getNodeByCoordinates is not supported; use HitRenderStrategy for coordinate lookup.',
    );
  });
});
