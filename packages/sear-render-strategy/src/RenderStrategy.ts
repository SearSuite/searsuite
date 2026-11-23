import { Inject } from '@searsuite/sear-foundation-di';
import { HexColor } from '@searsuite/sear-foundation-utils';
import { ConfigEngine } from '@searsuite/sear-assembly-config';
import {
  SceneGraph,
  Node,
  Tree,
  DirtyTree,
  NodeProperties,
  GenerationalDirtyTracker,
} from '@searsuite/sear-render-node';
import { RenderContext } from '@searsuite/sear-render-context';
import { ScrollManagerState, createDefaultScrollManagerState, ScrollManager } from '@searsuite/sear-render-scroll';
import { RenderCoordinatorManager } from '@searsuite/sear-render-registry';
import { PositionRect } from '@searsuite/sear-foundation-rect';

/**
 * Base abstraction for all render strategies.
 *
 * A render strategy encapsulates one rendering concern (screen layer, hit layer,
 * sticky overlays, dirty-region redraw, etc.) and shares a common life-cycle:
 *
 * 1. Receive scroll updates from {@link ScrollManager}.
 * 2. Derive absolute scroll position and frame delta.
 * 3. Trigger strategy-specific rendering.
 * 4. Persist previous scroll state for the next frame comparison.
 *
 * Subclasses only need to implement how they render, which context they expose,
 * and how they perform coordinate-based node lookup for their layer.
 *
 * @template T Node property shape used by this strategy.
 */
export abstract class RenderStrategy<T extends NodeProperties> {
  /** Current absolute scroll state consumed by the strategy. */
  protected scrollState: ScrollManagerState = createDefaultScrollManagerState();

  /** Previous frame scroll state used for delta and change detection. */
  protected previousScrollState: ScrollManagerState = createDefaultScrollManagerState();

  /** Indicates whether at least one successful render has been completed. */
  protected hasRendered: boolean = false;

  /** Creates a RenderStrategy instance. */
  constructor(
    @Inject(RenderContext.symbol) public readonly renderContext: RenderContext,
    @Inject(RenderContext.offScreenSymbol)
    public readonly offScreenRenderContext: RenderContext,
    @Inject(RenderContext.hitSymbol)
    public readonly hitRenderContext: RenderContext,

    @Inject(ScrollManager.symbol) public readonly scrollManager: ScrollManager,
    @Inject(ConfigEngine.symbol) configEngine: ConfigEngine,
    @Inject(RenderCoordinatorManager.symbol)
    public readonly renderCoordinatorManager: RenderCoordinatorManager,
    @Inject(SceneGraph.symbol) public readonly stage: SceneGraph<T>,
    @Inject(Tree.symbol) public readonly tree: Tree<PositionRect<HexColor>>,
    @Inject(GenerationalDirtyTracker.symbol)
    public readonly dirtyTree: GenerationalDirtyTracker,
  ) {
    // Every strategy reacts to the same scroll stream and decides how to redraw.
    this.scrollManager.subscribeScroll(this.handleScroll.bind(this));
  }

  /**
   * Checks whether scroll coordinates changed since the previous frame.
   */
  protected get isScrollStateChanged(): boolean {
    return this.previousScrollState.x !== this.scrollState.x || this.previousScrollState.y !== this.scrollState.y;
  }

  /**
   * Shared scroll handler for all concrete strategies.
   *
   * The handler normalizes the next scroll position, clamps it to the renderable
   * tree boundary, computes frame deltas, and then triggers rendering.
   */
  protected handleScroll(scrollManagerState: ScrollManagerState): void {
    // Some tests or early bootstrap stages may not provide a tree yet.
    if (!this.tree) return;

    const { scrollState } = this;
    // ScrollManager.update() already clamps x/y to the content boundary,
    // so scrollManagerState.x/y are the correct current position.
    scrollState.x = scrollManagerState.x;
    scrollState.y = scrollManagerState.y;

    scrollState.deltaX = this.previousScrollState.x - scrollState.x;
    scrollState.deltaY = this.previousScrollState.y - scrollState.y;

    if (this.shouldRenderOnScroll()) this.render(this.stage);
    this.hasRendered = true;
    this.previousScrollState = { ...this.scrollState };
  }

  /** Subclasses may let another coordinator schedule their scroll redraw. */
  protected shouldRenderOnScroll(): boolean {
    return true;
  }

  /**
   * Render contexts whose view scale is owned by this strategy.
   *
   * Strategies that introduce an additional layer can override this method
   * and include its context. RenderStrategyManager de-duplicates shared
   * contexts before applying a scale change.
   */
  public getViewScaleContexts(): readonly RenderContext[] {
    return [this.renderContext, this.offScreenRenderContext, this.hitRenderContext];
  }

  /**
   * Renders the target node tree according to the strategy semantics.
   */
  abstract render(node: Node<T>): void;

  /**
   * Returns the render context owned by this strategy.
   */
  abstract getContext(): RenderContext;

  /**
   * Resolves nodes around the provided coordinates for this strategy layer.
   */
  abstract getNodeByCoordinates(node: Node<T>, x: number, y: number): Node<T>[];
}
