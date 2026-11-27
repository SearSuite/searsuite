import { RenderContext } from '@searsuite/sear-render-context';
import { SceneGraph, Node, Tree, NodeProperties, FrameDirtyTracker } from '@searsuite/sear-render-node';
import { PositionRect } from '@searsuite/sear-foundation-rect';
import { Injectable, Inject } from '@searsuite/sear-foundation-di';

import { HexColor } from '@searsuite/sear-foundation-utils';
import { ConfigEngine } from '@searsuite/sear-assembly-config';
import { ScrollManager } from '@searsuite/sear-render-scroll';
import { RenderCoordinatorManager } from '@searsuite/sear-render-registry';
import { Platform } from '@searsuite/sear-foundation-platform';
import { RenderStrategy } from './RenderStrategy';

/**
 * Strategy for hit-testing rendering and coordinate-to-node lookup.
 *
 * The hit layer paints interactive nodes with unique colors on an off-screen
 * canvas. Pointer coordinates are then resolved by reading back pixel colors
 * and mapping them to scene nodes.
 *
 * @template NodeTypeProperties Node property shape used by the render tree.
 */
@Injectable()
export class HitRenderStrategy<NodeTypeProperties extends NodeProperties> extends RenderStrategy<NodeTypeProperties> {
  /** DI token for resolving HitRenderStrategy. */
  public static readonly symbol = Symbol.for('HitRenderStrategy');

  /** Timer handle used to debounce hit-layer redraw requests. */
  protected renderDebounceTimer: number | null = null;

  /** Last node scheduled for debounce rendering. */
  protected pendingNode: Node<NodeTypeProperties> | null = null;
  /** Coalesces scroll-driven hit redraws to one per animation frame. */
  protected scrollFrameHandle: number | null = null;
  protected pendingScrollNode: Node<NodeTypeProperties> | null = null;

  /** Creates a HitRenderStrategy instance. */
  constructor(
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
    @Inject(FrameDirtyTracker.symbol)
    dirtyTree: FrameDirtyTracker,
    @Inject(Platform.symbol) protected readonly platform: Platform,
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
  }

  /**
   * Get all nodes at the given (x, y) coordinate by reading the hit-canvas pixel.
   * @param node Root node to search from
   * @param x X coordinate
   * @param y Y coordinate
   * @returns Array of nodes at the given coordinate
   */
  public getNodeByCoordinates(node: Node<NodeTypeProperties>, x: number, y: number) {
    const currentShapes: Node<NodeTypeProperties>[] = [];
    const imageData = this.hitRenderContext.getImageData(x, y, 1, 1);
    let getColor = '';
    if (imageData) {
      const { data } = imageData;
      // Iterate over pixel data to find opaque pixels and map to nodes
      for (const rgb of data) {
        if (rgb[3] === 255) {
          const color = ((1 << 24) + (rgb[0] << 16) + (rgb[1] << 8) + rgb[2]).toString(16).slice(1).padStart(6, '0');
          getColor = `#${color}`;
          const target = node.getNodeByRandomColorKey(`#${color}`);
          if (target) currentShapes.push(target);
        }
      }
    }

    // console.log('%c ', `font-size: 1px; padding: ${8}px ${20}px; background: ${getColor} no-repeat; background-size: contain;`);
    return currentShapes;
  }

  /**
   * Debounced render entry. Only the last call within the delay will trigger rendering.
   * @param node Node to render
   * @param delay Debounce delay in ms
   */
  public render(node: Node<NodeTypeProperties>, delay = 100): void {
    this.pendingNode = node;
    if (this.renderDebounceTimer !== null) {
      this.platform.clearTimeout(this.renderDebounceTimer);
    }
    this.renderDebounceTimer = this.platform.setTimeout(this.#runDebouncedHitRender.bind(this), delay);
  }

  /**
   * Render the hit canvas immediately, bypassing the debounce timer.
   *
   * Used after viewport-culled plugins rebuild their scene nodes during scroll.
   * Since new FixBoxNode instances get new random color keys, the hit canvas
   * must be redrawn before the next click event. The normal debounced path
   * would keep resetting the timer during continuous scrolling, leaving the
   * hit canvas stale and clicks unresolvable.
   */
  public renderImmediate(node: Node<NodeTypeProperties>): void {
    if (this.renderDebounceTimer !== null) {
      this.platform.clearTimeout(this.renderDebounceTimer);
      this.renderDebounceTimer = null;
    }
    this.pendingNode = null;
    // Sync scroll state from ScrollManager before rendering.
    // When called from handleScrollReRender (which runs BEFORE
    // HitRenderStrategy.handleScroll), this.scrollState is still
    // at the previous position.  Without this sync, debouncedRender
    // would query the QuadTree at the old viewport and draw the hit
    // canvas at the wrong offset — all new nodes would be missed,
    // causing null targets on click.
    const currentState = this.scrollManager.getState();
    this.scrollState.x = currentState.x;
    this.scrollState.y = currentState.y;
    this.debouncedRender(node);
  }

  /**
   * Schedules a hit-layer refresh for the next frame.  Wheel events can be
   * delivered many times per frame; only the newest rebuilt scene matters.
   */
  public renderOnNextFrame(node: Node<NodeTypeProperties>): void {
    this.pendingScrollNode = node;
    if (this.scrollFrameHandle !== null) return;

    this.scrollFrameHandle = this.platform.requestAnimationFrame(this.#runScheduledHitRender.bind(this));
  }

  /** Cancels deferred hit-layer work when the owning editor is destroyed. */
  public destroy(): void {
    if (this.renderDebounceTimer !== null) {
      this.platform.clearTimeout(this.renderDebounceTimer);
      this.renderDebounceTimer = null;
    }
    if (this.scrollFrameHandle !== null) {
      this.platform.cancelAnimationFrame(this.scrollFrameHandle);
      this.scrollFrameHandle = null;
    }
    this.pendingNode = null;
    this.pendingScrollNode = null;
  }

  /**
   * Ensures a pointer event never reads a hit layer from before the latest
   * scroll-driven scene rebuild.  The normal path remains frame-coalesced;
   * this only runs when the user interacts before that frame is delivered.
   */
  public flushPendingScrollRender(): void {
    if (!this.pendingScrollNode) return;
    const pendingNode = this.pendingScrollNode;
    this.pendingScrollNode = null;
    if (this.scrollFrameHandle !== null) {
      this.platform.cancelAnimationFrame(this.scrollFrameHandle);
      this.scrollFrameHandle = null;
    }
    this.renderImmediate(pendingNode);
  }

  /** Scroll redraws are coordinated by SearCoreSheet after it rebuilds culled nodes. */
  protected override shouldRenderOnScroll(): boolean {
    return false;
  }

  /**
   * Actually performs the hit-canvas rendering after debounce.
   * @param node Node to render
   */
  debouncedRender(node: Node<NodeTypeProperties>): void {
    // Logs are kept for runtime profiling while tuning interaction latency.
    // console.log('HitRenderStrategy execution started');
    const [viewportWidth, viewportHeight] = this.scrollManager.getShape();
    const { scrollState } = this;
    this.hitRenderContext.resetHitFrame(viewportWidth, viewportHeight);

    this.hitRenderContext.save();
    // Apply scroll transform
    this.hitRenderContext.setTransform(1, 0, 0, 1, -scrollState.x, -scrollState.y);

    const blankRectWithScroll = new PositionRect<HexColor>(
      scrollState.x || 0,
      scrollState.y || 0,
      viewportWidth,
      viewportHeight,
    );

    const nodes = node.query(blankRectWithScroll).filter(isHitDrawableNode);
    for (const child of nodes) child.drawHit(this.hitRenderContext);

    this.hitRenderContext.restore();
    this.#drawStickyHits(node, viewportWidth, viewportHeight);
  }

  #drawStickyHits(node: Node<NodeTypeProperties>, width: number, height: number): void {
    const { x, y } = this.scrollState;
    const groups: readonly {
      rect: PositionRect<HexColor>;
      transform: [number, number, number, number, number, number];
      accepts: (candidate: Node<NodeTypeProperties>) => boolean;
    }[] = [
      {
        rect: new PositionRect(0, y, width, height),
        transform: [1, 0, 0, 1, 0, -y],
        accepts: (candidate) => candidate.left !== void 0 && candidate.top === void 0,
      },
      {
        rect: new PositionRect(x, 0, width, height),
        transform: [1, 0, 0, 1, -x, 0],
        accepts: (candidate) => candidate.top !== void 0 && candidate.left === void 0,
      },
      {
        rect: new PositionRect(0, 0, width, height),
        transform: [1, 0, 0, 1, 0, 0],
        accepts: (candidate) => candidate.top !== void 0 && candidate.left !== void 0,
      },
    ];
    for (const group of groups) {
      const candidates = node
        .query(group.rect)
        .filter((candidate) => candidate.sticky && group.accepts(candidate) && isHitDrawableNode(candidate));
      if (candidates.length === 0) continue;
      this.hitRenderContext.save();
      this.hitRenderContext.setTransform(...group.transform);
      for (const candidate of candidates) candidate.drawHit(this.hitRenderContext);
      this.hitRenderContext.restore();
    }
  }

  #runDebouncedHitRender(): void {
    if (this.pendingNode) {
      this.debouncedRender(this.pendingNode);
      this.pendingNode = null;
    }
    this.renderDebounceTimer = null;
  }

  #runScheduledHitRender(): void {
    const pendingNode = this.pendingScrollNode;
    this.pendingScrollNode = null;
    this.scrollFrameHandle = null;
    if (pendingNode) this.renderImmediate(pendingNode);
  }

  /**
   * Get the current rendering context.
   * @returns RenderContext
   */
  getContext(): RenderContext {
    return this.hitRenderContext;
  }
}

function isHitDrawableNode<NodeTypeProperties extends NodeProperties>(node: Node<NodeTypeProperties>): boolean {
  return node.properties?.skipHit !== true && typeof node.drawHit === 'function';
}
