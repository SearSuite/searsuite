import { SearError } from '@searsuite/sear-foundation-error';
import { RenderContext } from '@searsuite/sear-render-context';
import {
  GenerationalDirtyTracker,
  NodeProperties,
  Node,
  SceneGraph,
  Tree,
} from '@searsuite/sear-render-node';
import { PositionRect } from '@searsuite/sear-foundation-rect';

import { RenderStrategy } from './RenderStrategy';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { HexColor } from '@searsuite/sear-foundation-utils';
import { ScrollManager, type ScrollManagerState } from '@searsuite/sear-render-scroll';
import { RasterCopyExecutor } from './RasterCopyExecutor';
import { RasterCopyPlan } from './RasterCopyPlan';
import { BlockRasterCopyPlan } from './BlockRasterCopyPlan';
import { createViewportFrameCache, ViewportFrameCache } from './ViewportFrameCache';
import { clearViewport, requiresViewportFrameRebuild } from './ViewportRenderHelpers';
import { ConfigEngine } from '@searsuite/sear-assembly-config';
import { RenderCoordinatorManager } from '@searsuite/sear-render-registry';

/**
 * ScreenRenderStrategy handles rendering with an off-screen buffer to optimize scroll performance.
 * It minimizes redraws by copying unchanged regions and only re-rendering areas affected by scrolling.
 *
 * Rendering modes:
 * - First frame: full draw to screen, then clone into off-screen buffer.
 * - Scroll frame: blit preserved region from off-screen, redraw only newly exposed strip,
 *   then sync back to off-screen.
 */
export type ScreenRenderFrameMode = 'rebuild' | 'full' | 'scroll' | 'block-copy';

export interface ScreenRenderStrategyRuntime<NodeTypeProperties extends NodeProperties> {
  /** Returns the viewport-space rectangle covered by this screen layer. */
  readonly getViewport?: () => PositionRect<HexColor>;
  /** Returns the scroll state used for world queries and raster copy deltas. */
  readonly getScrollState?: () => ScrollManagerState;
  /** Returns whether the current scroll state requires a scroll-copy frame. */
  readonly isScrollStateChanged?: (scrollState: ScrollManagerState) => boolean;
  /** Forces a full visible body repaint even when the off-screen cache is ready. */
  readonly forceFullRepaint?: () => boolean;
  /** Returns whether this frame should rebuild a retained render target. */
  readonly requiresFrameRebuild?: () => boolean;
  /** Maps a viewport-space repaint rectangle to a world-space query rectangle. */
  readonly toWorldRect?: (
    viewportRect: PositionRect<HexColor>,
    scrollState: ScrollManagerState,
  ) => PositionRect<HexColor>;
  /** Returns screen-body nodes to draw for the supplied world-space rectangle. */
  readonly queryNodes?: (
    root: Node<NodeTypeProperties>,
    worldRect: PositionRect<HexColor>,
  ) => readonly Node<NodeTypeProperties>[];
  /** Draws already queried nodes into the visible render context. */
  readonly drawNodes?: (input: {
    readonly context: RenderContext;
    readonly nodes: readonly Node<NodeTypeProperties>[];
    readonly worldRect: PositionRect<HexColor>;
    readonly scrollState: ScrollManagerState;
  }) => void;
  /** Consumes a pending block-copy plan for layout-shift frames, if the host has one. */
  readonly consumeBlockRasterCopyPlan?: () => BlockRasterCopyPlan | null;
  /** Called after a full, scroll, or rebuilt frame is rendered. */
  readonly onFrameRendered?: (mode: ScreenRenderFrameMode) => void;
}

@Injectable()
export class ScreenRenderStrategy<
  NodeTypeProperties extends NodeProperties,
> extends RenderStrategy<NodeTypeProperties> {
  readonly #rasterCopyExecutor: RasterCopyExecutor;

  /** DI token for resolving ScreenRenderStrategy. */
  public static readonly symbol = Symbol.for('ScreenRenderStrategy');

  #runtime: ScreenRenderStrategyRuntime<NodeTypeProperties> = {};

  /** Creates a screen render strategy with injected render targets and copy executor. */
  public constructor(
    @Inject(RenderContext.symbol) renderContext: RenderContext,
    @Inject(RenderContext.offScreenSymbol)
    offScreenRenderContext: RenderContext,
    @Inject(RenderContext.hitSymbol)
    hitRenderContext: RenderContext,
    @Inject(ScrollManager.symbol) scrollManager: ScrollManager,
    @Inject(ConfigEngine.symbol) configEngine: ConfigEngine,
    @Inject(RenderCoordinatorManager.symbol)
    renderCoordinatorManager: RenderCoordinatorManager,
    @Inject(SceneGraph.symbol) stage: SceneGraph<NodeTypeProperties>,
    @Inject(Tree.symbol) tree: Tree<PositionRect<HexColor>>,
    @Inject(GenerationalDirtyTracker.symbol)
    dirtyTree: GenerationalDirtyTracker,
    @Inject(RasterCopyExecutor.symbol)
    rasterCopyExecutor: RasterCopyExecutor,
  ) {
    super(
      renderContext,
      offScreenRenderContext,
      hitRenderContext,
      scrollManager,
      configEngine,
      renderCoordinatorManager,
      stage,
      tree,
      dirtyTree,
    );
    this.#rasterCopyExecutor = rasterCopyExecutor;
  }

  /** Configures host-specific viewport, query, and drawing semantics. */
  public configureRuntime(runtime: ScreenRenderStrategyRuntime<NodeTypeProperties>): void {
    this.#runtime = runtime;
  }

  /**
   * Renders the scene graph node using an off-screen buffer for efficient scrolling.
   * @param node The root node to render.
   */
  render(node: Node<NodeTypeProperties>): void {
    // debugger;
    const scrollState = this.#resolveScrollState();
    const viewport = this.#resolveViewport();
    if (this.#runtime.requiresFrameRebuild?.() ?? requiresViewportFrameRebuild(this.renderContext)) {
      this.#renderRebuiltFrame(node, viewport, scrollState);
      return;
    }
    const frameCache = createViewportFrameCache(this.offScreenRenderContext, this.#rasterCopyExecutor);
    if (frameCache.isReady() && this.#runtime.forceFullRepaint?.() !== true) {
      const hasScrollChange = this.#resolveIsScrollStateChanged(scrollState);
      const blockCopyPlan = this.#runtime.consumeBlockRasterCopyPlan?.() ?? null;
      if (blockCopyPlan && !hasScrollChange) {
        this.#renderBlockCopyFrame(node, frameCache, blockCopyPlan, scrollState);
        return;
      }
      if (!hasScrollChange) return;
      if (Math.abs(scrollState.deltaX) >= viewport.width || Math.abs(scrollState.deltaY) >= viewport.height) {
        clearViewport(this.renderContext, viewport);
        this.#drawQueriedNodes(node, this.#resolveWorldRect(viewport, scrollState), scrollState);
        frameCache.refreshFromVisibleFrame(this.renderContext, viewport);
        this.#runtime.onFrameRendered?.('full');
        this.#markRenderScrollStateConsumed();
        return;
      }
      const copyPlan = RasterCopyPlan.fromScroll(viewport, scrollState);

      // Clear the main canvas
      clearViewport(this.renderContext, copyPlan.viewport);

      // Copy the relevant region from the off-screen buffer to the main canvas
      this.#rasterCopyExecutor.copy(this.offScreenRenderContext, this.renderContext, copyPlan.cacheToViewportCopy);

      // Render the newly exposed (blank) area due to scrolling
      const blankWorldRect = this.#resolveWorldRect(copyPlan.blankViewportRect, scrollState);
      this.#drawQueriedNodes(node, blankWorldRect, scrollState);

      // Copy the updated main canvas back to the off-screen buffer
      frameCache.refreshFromVisibleFrame(this.renderContext, copyPlan.viewport);
      this.#runtime.onFrameRendered?.('scroll');
      this.#markRenderScrollStateConsumed();
    } else {
      // First render: draw everything and initialize the off-screen buffer
      const visibleRect = this.#resolveWorldRect(viewport, scrollState);

      this.renderContext.save();
      this.renderContext.setTransform(1, 0, 0, 1, 0, 0);
      this.renderContext.clearRect(viewport.x, viewport.y, viewport.width, viewport.height);
      this.renderContext.restore();
      this.#drawQueriedNodes(node, visibleRect, scrollState);
      // A cache rebuild (including every view-scale change) must be a
      // replacement, never an incremental composition over old pixels.
      // The visible canvas is already a complete base-layer frame here.
      // Clone the complete base frame to initialize the off-screen buffer.
      frameCache.primeFromVisibleFrame(this.renderContext, viewport);
      this.#runtime.onFrameRendered?.('full');
      this.#markRenderScrollStateConsumed();
    }
  }

  #renderBlockCopyFrame(
    node: Node<NodeTypeProperties>,
    frameCache: ViewportFrameCache,
    copyPlan: BlockRasterCopyPlan,
    scrollState: ScrollManagerState,
  ): void {
    // debugger;
    for (const clearRect of copyPlan.clearViewportRects) {
      clearViewport(this.renderContext, clearRect);
    }
    for (const invalidWorldRect of copyPlan.invalidWorldRects) {
      this.#drawQueriedNodes(node, invalidWorldRect, scrollState);
    }
    for (const copy of copyPlan.cacheToViewportCopies) {
      this.#rasterCopyExecutor.copy(this.offScreenRenderContext, this.renderContext, copy);
    }
    frameCache.refreshFromVisibleFrame(this.renderContext, copyPlan.viewport);
    this.#runtime.onFrameRendered?.('block-copy');
    this.#markRenderScrollStateConsumed();
  }

  /** Lets SearCoreSheet batch scroll rendering with scene regeneration into one frame. */
  protected override shouldRenderOnScroll(): boolean {
    return false;
  }

  /** Renders a target that replaces its complete frame rather than reusing a raster cache. */
  #renderRebuiltFrame(
    node: Node<NodeTypeProperties>,
    viewport: PositionRect<HexColor>,
    scrollState: ScrollManagerState,
  ): void {
    // debugger;
    const visibleRect = this.#resolveWorldRect(viewport, scrollState);
    this.renderContext.beginFrame();
    this.#drawQueriedNodes(node, visibleRect, scrollState);
    this.#runtime.onFrameRendered?.('rebuild');
    this.#markRenderScrollStateConsumed();
  }

  #resolveViewport(): PositionRect<HexColor> {
    return this.#runtime.getViewport?.() ?? this.scrollManager.getPositionRect();
  }

  #resolveScrollState(): ScrollManagerState {
    if (this.#runtime.getScrollState) return this.#runtime.getScrollState();
    if (typeof this.scrollManager.getRenderScrollState === 'function') return this.scrollManager.getRenderScrollState();
    return this.scrollState;
  }

  #resolveIsScrollStateChanged(scrollState: ScrollManagerState): boolean {
    const runtimeResult = this.#runtime.isScrollStateChanged?.(scrollState);
    if (runtimeResult !== void 0) return runtimeResult;
    return (
      (typeof this.scrollManager.hasUnrenderedScroll === 'function' && this.scrollManager.hasUnrenderedScroll()) ||
      this.isScrollStateChanged ||
      scrollState.deltaX !== 0 ||
      scrollState.deltaY !== 0
    );
  }

  #markRenderScrollStateConsumed(): void {
    if (typeof this.scrollManager.markScrollStateRendered === 'function') {
      this.scrollManager.markScrollStateRendered();
    }
  }

  #resolveWorldRect(
    viewportRect: PositionRect<HexColor>,
    scrollState: ScrollManagerState,
  ): PositionRect<HexColor> {
    return (
      this.#runtime.toWorldRect?.(viewportRect, scrollState) ??
      createWorldRectFromViewport(viewportRect, scrollState)
    );
  }

  #queryScreenNodes(
    node: Node<NodeTypeProperties>,
    worldRect: PositionRect<HexColor>,
  ): readonly Node<NodeTypeProperties>[] {
    const runtimeNodes = this.#runtime.queryNodes?.(node, worldRect);
    if (runtimeNodes) return runtimeNodes;
    const screenNodes: Node<NodeTypeProperties>[] = [];
    for (const candidate of node.query(worldRect)) {
      if (!candidate.sticky && !candidate.properties?.isEdit) screenNodes.push(candidate);
    }
    return screenNodes;
  }

  #drawQueriedNodes(
    node: Node<NodeTypeProperties>,
    worldRect: PositionRect<HexColor>,
    scrollState: ScrollManagerState,
  ): void {
    // debugger;
    const nodes = this.#queryScreenNodes(node, worldRect);
    if (this.#runtime.drawNodes) {
      this.#runtime.drawNodes({ context: this.renderContext, nodes, worldRect, scrollState });
      return;
    }

    this.renderContext.save();
    this.renderContext.setTransform(1, 0, 0, 1, -scrollState.x, -scrollState.y);
    for (const child of nodes) {
      child.drawScene(this.renderContext, worldRect);
    }
    this.renderContext.restore();
  }

  /**
   * Returns the current render context.
   *
   * The returned context targets the on-screen canvas.
   */
  getContext(): RenderContext {
    return this.renderContext;
  }

  /**
   * Not implemented: Finds nodes at the given coordinates.
   * @throws Error
   */
  getNodeByCoordinates(node: Node<NodeTypeProperties>, x: number, y: number): Node<NodeTypeProperties>[] {
    throw new SearError('ScreenRenderStrategy.getNodeByCoordinates is not supported; use HitRenderStrategy for coordinate lookup.');
  }
}

function createWorldRectFromViewport(
  viewportRect: PositionRect<HexColor>,
  scrollState: Pick<ScrollManagerState, 'x' | 'y'>,
): PositionRect<HexColor> {
  return new PositionRect<HexColor>(
    viewportRect.x + scrollState.x,
    viewportRect.y + scrollState.y,
    viewportRect.width,
    viewportRect.height,
  );
}
