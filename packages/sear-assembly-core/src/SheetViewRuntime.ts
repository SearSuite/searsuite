import { type SheetCommitNotification } from '@searsuite/sear-domain-sheet';
import { type ViewExtension, type ViewExtensionRegistry } from '@searsuite/sear-render-event-engine';

import { type CellProperties } from '@searsuite/sear-render-registry';
import { type ScrollManagerState } from '@searsuite/sear-render-scroll';
import { PositionRect } from '@searsuite/sear-foundation-rect';
import { type HexColor } from '@searsuite/sear-foundation-utils';
import { type Tree } from '@searsuite/sear-render-node';
import { readSheetColumnSizes, readSheetRowSizes } from '@searsuite/sear-domain-sheet';
import { updateSheetContentBoundary } from './SheetContentBoundary';
import { type Platform } from '@searsuite/sear-foundation-platform';

import { type SearCoreSheet } from './SearCoreSheet';

/** Scene and painting subscriber attached to a Sheet kernel by the visual assembly. */
export class SheetViewRuntime {
  readonly #core: SearCoreSheet;
  readonly #platform: Platform;
  readonly #extensions: ViewExtensionRegistry<SearCoreSheet, CellProperties>;
  #stopScrollReRender: (() => void) | undefined;
  #scrollRenderFrame: number | null = null;
  #sheetBoundarySize: { width: number; height: number; viewportWidth: number; viewportHeight: number } | null = null;
  #destroyed = false;

  /** Binds an independent presentation subscriber without taking business state ownership. */
  constructor(
    core: SearCoreSheet,
    extensions: ViewExtensionRegistry<SearCoreSheet, CellProperties>,
    platform: Platform,
  ) {
    this.#core = core;
    this.#extensions = extensions;
    this.#platform = platform;
  }

  /** Builds the initial scene for one visual contribution. */
  initializeExtension(plugin: ViewExtension<SearCoreSheet, CellProperties>): void {
    if (!plugin.render) return;
    this.#core.getStage().addPluginNode(plugin.key.key, plugin.render(this.#core) || []);
  }

  /** Repaints local visual state without creating a business transaction or commit. */
  public requestRender(views: readonly Pick<ViewExtension<SearCoreSheet, CellProperties>, 'key'>[]): void {
    if (this.#destroyed) return;
    let changed = false;
    for (const view of views) {
      const extension = this.#extensions.get(view.key);
      if (!extension) continue;
      this.initializeExtension(extension);
      changed = true;
    }
    if (!changed) return;
    this.#core.renderEngine.render(this.#core.getStage());
    this.#core.eventEngine.render(this.#core.getStage());
  }

  /** Starts visual frame and viewport subscriptions. */
  start(): void {
    this.#core.renderEngine.render(this.#core.getStage());
    this.#core.eventEngine.render(this.#core.getStage());
    this.refreshBoundaries();
    this.#stopScrollReRender = this.#core.renderEngine.scrollManager.subscribeScroll(
      this.#handleScrollReRender.bind(this),
      true,
    );
  }

  /** Queries committed state after receiving a neutral, immutable publication. */
  onCommit(commit: SheetCommitNotification): void {
    if (this.#destroyed || (!commit.changedOwners.length && !commit.projections.length && !commit.interactionChanged))
      return;
    this.refreshBoundaries();
    this.#extensions.forEach((extension) => extension.onCommit?.(this.#core));
    this.#extensions.forEach((extension) => this.initializeExtension(extension));
    this.#core.renderEngine.render(this.#core.getStage());
    this.#core.eventEngine.render(this.#core.getStage());
  }

  /** Rebuilds retained scene geometry after a view-scale or viewport change. */
  refreshViewport(): void {
    if (this.#destroyed) return;
    this.refreshBoundaries();
    this.#core.renderEngine.invalidateScreenCache();
    this.#rebuildViewportNodes();
    this.#core.renderEngine.render(this.#core.getStage());
    this.#core.eventEngine.renderImmediate(this.#core.getStage());
  }

  /** Releases view-owned subscriptions and pending frames. */
  destroy(): void {
    this.#destroyed = true;
    this.#stopScrollReRender?.();
    this.#stopScrollReRender = undefined;
    if (this.#scrollRenderFrame !== null) this.#platform.cancelAnimationFrame(this.#scrollRenderFrame);
    this.#scrollRenderFrame = null;
  }

  /**
   * Scroll-driven re-render: regenerate viewport-culled plugin nodes
   * when the scroll position changes.  ScrollManager.update() clamps
   * the position before notifying subscribers, so getState() already
   * returns the correct clamped position — computeViewportRange()
   * inside each view extension works correctly.
   */
  #handleScrollReRender(_scrollState: ScrollManagerState): void {
    if (this.#scrollRenderFrame !== null) return;
    this.#scrollRenderFrame = this.#platform.requestAnimationFrame(this.#runScheduledScrollRender.bind(this));
  }

  #runScheduledScrollRender(): void {
    this.#scrollRenderFrame = null;
    this.#renderScrollFrame();
  }

  /** Rebuilds viewport-culled nodes and paints one visual frame for the latest scroll position. */
  #renderScrollFrame(): void {
    if (this.#destroyed) return;
    // A command may paint the old scene after committing the scroll position,
    // consuming the scroll delta before this scheduled scene rebuild runs.
    // Repaint the rebuilt nodes even when the raster cache now looks current.
    if (this.#core.renderEngine.scrollManager.hasUnrenderedScroll() === false) {
      this.#core.renderEngine.invalidateScreenCache();
    }
    this.#rebuildViewportNodes();

    this.#core.renderEngine.render(this.#core.getStage());

    // Viewport-culling creates new hit colors, but wheel events can arrive
    // faster than frames.  Rebuild the hit layer once for the newest scene
    // in the next frame instead of once for every wheel event.
    this.#core.eventEngine.renderHitOnNextFrame(this.#core.getStage());
  }

  #rebuildViewportNodes(): void {
    this.#extensions.forEach((plugin) => {
      if (!plugin.render) return;
      const shapes = plugin.render(this.#core) || [];
      this.#core.getStage().addPluginNode(plugin.key.key, shapes, { markDirty: false });
    });
  }

  /**
   * Expand the spatial tree boundary and ScrollManager content boundary
   * to cover the full sheet dimensions.
   *
   * - Tree boundary: prevents RenderStrategy.handleScroll from clamping
   *   scroll position to the viewport-sized QuadTree boundary.
   * - Content boundary: ScrollManager.update() uses it to clamp the
   *   scroll position, ensuring getState() always returns the actual
   *   position. This makes ScrollManager the single source of truth.
   */
  refreshBoundaries(): void {
    const rowSizes = readSheetRowSizes(this.#core.dataEngine);
    const columnSizes = readSheetColumnSizes(this.#core.dataEngine);
    if (!rowSizes || !columnSizes) return;

    const totalWidth = columnSizes.getDimensionRightBoundaryByIndex(columnSizes.shape[1] - 1);
    const totalHeight = rowSizes.getDimensionRightBoundaryByIndex(rowSizes.shape[1] - 1);
    const [viewportWidth, viewportHeight] = this.#core.renderEngine.scrollManager.getShape();
    const previous = this.#sheetBoundarySize;
    if (
      previous?.width === totalWidth &&
      previous.height === totalHeight &&
      previous.viewportWidth === viewportWidth &&
      previous.viewportHeight === viewportHeight
    )
      return;

    // Expand QuadTree boundary
    const tree = this.#core.getStage()['positionRectStorage'] as Tree<PositionRect<HexColor>>;
    if (tree) {
      const currentBoundary = tree.getBoundary();
      const fullBoundary = new PositionRect<HexColor>(
        currentBoundary.x,
        currentBoundary.y,
        Math.max(currentBoundary.width, totalWidth),
        Math.max(currentBoundary.height, totalHeight),
      );
      tree.updateBoundary(fullBoundary);
      this.#sheetBoundarySize = { width: totalWidth, height: totalHeight, viewportWidth, viewportHeight };
    }

    updateSheetContentBoundary(this.#core);
  }
}
