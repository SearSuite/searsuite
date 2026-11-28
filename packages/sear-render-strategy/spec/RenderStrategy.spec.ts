import { type Node, type NodeProperties } from '@searsuite/sear-render-node';
import { type ScrollManagerState } from '@searsuite/sear-render-scroll';
import { RenderStrategy } from '../src/RenderStrategy';
import { createDirtyTracker, createRenderContext, createScrollManager, createTree } from './testFactories';
import './testSetup';

class TestRenderStrategy extends RenderStrategy<NodeProperties> {
  public render = jest.fn();

  getContext() {
    return this.renderContext;
  }

  getNodeByCoordinates(_node: Node<NodeProperties>, _x: number, _y: number): Node<NodeProperties>[] {
    return [];
  }

  triggerScroll(x: number, y: number): void {
    this.handleScroll({ x, y, deltaX: 0, deltaY: 0 });
  }

  get state(): ScrollManagerState {
    return this.scrollState;
  }
  get previousState(): ScrollManagerState {
    return this.previousScrollState;
  }
  get rendered(): boolean {
    return this.hasRendered;
  }
  get scrollChanged(): boolean {
    return this.isScrollStateChanged;
  }
  setStates(previous: ScrollManagerState, current: ScrollManagerState): void {
    this.previousScrollState = previous;
    this.scrollState = current;
  }
  clearTreeForTest(): void {
    Object.defineProperty(this, 'tree', { value: null });
  }
}

function createStrategy(
  viewportWidth = 100,
  viewportHeight = 80,
  treeWidth = 1000,
  treeHeight = 800,
): TestRenderStrategy {
  const args = [
    createRenderContext(),
    createRenderContext(),
    createRenderContext(),
    createScrollManager(viewportWidth, viewportHeight),
    {},
    {},
    createTree(treeWidth, treeHeight),
    createDirtyTracker(),
  ] as unknown as ConstructorParameters<typeof TestRenderStrategy>;
  return new TestRenderStrategy(...args);
}

describe('RenderStrategy', () => {
  it('subscribes to scroll and renders on scroll updates', () => {
    const renderContext = createRenderContext();
    const offScreenRenderContext = createRenderContext();
    const hitRenderContext = createRenderContext();
    const scrollManager = createScrollManager(100, 80);

    const stage = { id: 'stage' };
    const tree = createTree(400, 300);
    const dirtyTree = createDirtyTracker();

    const strategy = new TestRenderStrategy(
      renderContext as unknown as ConstructorParameters<typeof TestRenderStrategy>[0],
      offScreenRenderContext as unknown as ConstructorParameters<typeof TestRenderStrategy>[1],
      hitRenderContext as unknown as ConstructorParameters<typeof TestRenderStrategy>[2],
      scrollManager as unknown as ConstructorParameters<typeof TestRenderStrategy>[3],
      {} as ConstructorParameters<typeof TestRenderStrategy>[4],
      stage as unknown as ConstructorParameters<typeof TestRenderStrategy>[5],
      tree as unknown as ConstructorParameters<typeof TestRenderStrategy>[6],
      dirtyTree as unknown as ConstructorParameters<typeof TestRenderStrategy>[7],
    );

    expect(scrollManager.subscribeScroll).toHaveBeenCalledTimes(1);

    strategy.triggerScroll(20, 15);

    expect(strategy.render).toHaveBeenCalledWith(stage);
    expect(strategy.rendered).toBe(true);
    expect(strategy.state.x).toBe(20);
    expect(strategy.state.y).toBe(15);
    expect(strategy.previousState.x).toBe(20);
    expect(strategy.previousState.y).toBe(15);
  });

  it('clamps scroll position to boundaries and computes delta', () => {
    const strategy = createStrategy(90, 70, 100, 100);
    strategy.triggerScroll(10, 30);
    expect(strategy.state.x).toBe(10);
    expect(strategy.state.y).toBe(30);

    strategy.triggerScroll(0, 0);
    expect(strategy.state.x).toBe(0);
    expect(strategy.state.y).toBe(0);
    expect(strategy.state.deltaX).toBe(10);
    expect(strategy.state.deltaY).toBe(30);
  });

  it('returns early when tree is missing', () => {
    const strategy = createStrategy(100, 100, 100, 100);
    strategy.clearTreeForTest();
    strategy.triggerScroll(1, 1);

    expect(strategy.render).not.toHaveBeenCalled();
  });

  it('detects scroll state changes through the protected getter', () => {
    const strategy = createStrategy(1, 1, 1, 1);
    strategy.setStates({ x: 0, y: 0, deltaX: 0, deltaY: 0 }, { x: 0, y: 0, deltaX: 0, deltaY: 0 });
    expect(strategy.scrollChanged).toBe(false);

    strategy.setStates({ x: 0, y: 0, deltaX: 0, deltaY: 0 }, { x: 1, y: 0, deltaX: 0, deltaY: 0 });
    expect(strategy.scrollChanged).toBe(true);
  });

  it('uses boundary fallback branches when tree size is zero', () => {
    const strategy = createStrategy(0, 0, 0, 0);
    strategy.triggerScroll(0, 0);
    expect(strategy.state.x).toBe(0);
    expect(strategy.state.y).toBe(0);
  });
});
