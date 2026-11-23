import { PositionRect, type PositionRectProps } from '@searsuite/sear-foundation-rect';
import { HexColor } from '@searsuite/sear-foundation-utils';
import { type ScrollManagerState } from '@searsuite/sear-render-scroll';

/** Source and destination rectangles for one raster copy. */
export interface RasterCopyRect {
  /** Source pixels inside the source render target, expressed in viewport coordinates. */
  readonly source: PositionRectProps;
  /** Destination pixels inside the destination render target, expressed in viewport coordinates. */
  readonly destination: PositionRectProps;
}

/**
 * Immutable plan for reusing viewport pixels across render targets.
 *
 * A plan describes the off-screen-to-visible copy for a scroll frame, the newly
 * exposed viewport rectangle that still needs node redraw, and the final
 * visible-to-off-screen copy that refreshes the cache after redraw.
 */
export class RasterCopyPlan {
  /** Viewport rectangle in viewport coordinates. */
  public readonly viewport: PositionRect<HexColor>;
  /** Copy from the cached frame into the visible target. */
  public readonly cacheToViewportCopy: RasterCopyRect;
  /** Newly exposed viewport-space area to redraw. */
  public readonly blankViewportRect: PositionRect<HexColor>;
  /** Newly exposed world-space area to query from the scene. */
  public readonly blankWorldRect: PositionRect<HexColor>;
  /** Copy from the visible target back into the cache. */
  public readonly viewportToCacheCopy: RasterCopyRect;

  /**
   * Creates a raster copy plan.
   *
   * @param viewport Viewport rectangle in viewport coordinates.
   * @param cacheToViewportCopy Copy from the cached frame into the visible target.
   * @param blankViewportRect Newly exposed viewport-space area to redraw.
   * @param blankWorldRect Newly exposed world-space area to query from the scene.
   * @param viewportToCacheCopy Copy from the visible target back into the cache.
   */
  public constructor(
    viewport: PositionRect<HexColor>,
    cacheToViewportCopy: RasterCopyRect,
    blankViewportRect: PositionRect<HexColor>,
    blankWorldRect: PositionRect<HexColor>,
    viewportToCacheCopy: RasterCopyRect,
  ) {
    this.viewport = viewport;
    this.cacheToViewportCopy = cacheToViewportCopy;
    this.blankViewportRect = blankViewportRect;
    this.blankWorldRect = blankWorldRect;
    this.viewportToCacheCopy = viewportToCacheCopy;
  }

  /**
   * Builds the scroll-copy plan used by Canvas viewport renderers.
   *
   * The delta convention follows `RenderStrategy`: `delta` is previous minus
   * current, while `drawImage` source offsets use current minus previous.
   *
   * @param viewport Visible viewport rectangle in viewport coordinates.
   * @param scrollState Current scroll snapshot.
   * @returns Plan for copy, exposed-area redraw, and cache refresh.
   */
  public static fromScroll(viewport: PositionRect<HexColor>, scrollState: ScrollManagerState): RasterCopyPlan {
    const { deltaX, deltaY } = scrollState;
    const blankX = deltaX < 0 ? viewport.x + viewport.width + deltaX : viewport.x;
    const blankY = deltaY < 0 ? viewport.y + viewport.height + deltaY : viewport.y;
    const blankWidth = deltaX !== 0 ? Math.abs(deltaX) : viewport.width;
    const blankHeight = deltaY !== 0 ? Math.abs(deltaY) : viewport.height;
    const blankViewportRect = new PositionRect<HexColor>(blankX, blankY, blankWidth, blankHeight);
    const blankWorldRect = new PositionRect<HexColor>(
      blankViewportRect.x + (scrollState.x || 0),
      blankViewportRect.y + (scrollState.y || 0),
      blankViewportRect.width,
      blankViewportRect.height,
    );

    return new RasterCopyPlan(
      viewport,
      {
        destination: {
          x: viewport.x,
          y: viewport.y,
          width: viewport.width,
          height: viewport.height,
        },
        source: {
          x: viewport.x - deltaX,
          y: viewport.y - deltaY,
          width: viewport.width,
          height: viewport.height,
        },
      },
      blankViewportRect,
      blankWorldRect,
      RasterCopyPlan.createViewportToCacheCopy(viewport),
    );
  }

  /**
   * Creates a full-viewport copy from the visible target into the frame cache.
   *
   * @param viewport Viewport-space bounds to copy.
   * @returns Copy rectangle with identical source and destination bounds.
   */
  public static createViewportToCacheCopy(viewport: PositionRectProps): RasterCopyRect {
    return {
      destination: {
        x: viewport.x,
        y: viewport.y,
        width: viewport.width,
        height: viewport.height,
      },
      source: {
        x: viewport.x,
        y: viewport.y,
        width: viewport.width,
        height: viewport.height,
      },
    };
  }
}
