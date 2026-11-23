import { type PositionRectProps } from '@searsuite/sear-foundation-rect';
import { RenderContext } from '@searsuite/sear-render-context';

import { RasterCopyExecutor } from './RasterCopyExecutor';
import { RasterCopyPlan } from './RasterCopyPlan';
import { clearViewport } from './ViewportRenderHelpers';

/**
 * Manages the off-screen viewport frame used by Canvas scroll optimization.
 *
 * The cache wraps `RenderContext.isDrawn` so consumers do not need to reach into
 * the render target directly. It provides explicit operations for clearing,
 * priming after first paint, and refreshing after an incremental scroll redraw.
 */
export class ViewportFrameCache {
  private readonly copyExecutor: RasterCopyExecutor;

  /**
   * Creates a viewport frame cache facade.
   *
   * @param cacheContext Off-screen render target that stores the last complete base frame.
   * @param copyExecutor Raster copy executor used for cache synchronization.
   */
  public constructor(
    private readonly cacheContext: RenderContext,
    copyExecutor: RasterCopyExecutor,
  ) {
    this.copyExecutor = copyExecutor;
  }

  /** Returns whether the cache already contains a complete base frame. */
  public isReady(): boolean {
    return this.cacheContext.isDrawn;
  }

  /** Marks the cached frame invalid so the next render performs a full prime. */
  public invalidate(): void {
    this.cacheContext.isDrawn = false;
  }

  /** Marks the cached frame ready after a complete frame has been copied in. */
  public markReady(): void {
    this.cacheContext.isDrawn = true;
  }

  /**
   * Clears the cached viewport with an identity transform.
   *
   * @param viewport Viewport-space rectangle to erase from the cache.
   */
  public clear(viewport: PositionRectProps): void {
    clearViewport(this.cacheContext, viewport);
  }

  /**
   * Primes the cache from the visible frame after a first full paint.
   *
   * @param visibleContext Visible render target containing a complete base frame.
   * @param viewport Viewport-space rectangle to clear before copying.
   */
  public primeFromVisibleFrame(visibleContext: RenderContext, viewport: PositionRectProps): void {
    this.clear(viewport);
    this.copyExecutor.copy(visibleContext, this.cacheContext, RasterCopyPlan.createViewportToCacheCopy(viewport));
    this.markReady();
  }

  /**
   * Refreshes the cache from the visible target after incremental redraw.
   *
   * @param visibleContext Visible render target containing the latest base frame.
   * @param viewport Viewport-space rectangle to copy into the cache.
   */
  public refreshFromVisibleFrame(visibleContext: RenderContext, viewport: PositionRectProps): void {
    this.clear(viewport);
    this.copyExecutor.copy(visibleContext, this.cacheContext, RasterCopyPlan.createViewportToCacheCopy(viewport));
    this.markReady();
  }
}

export function createViewportFrameCache(
  cacheContext: RenderContext,
  copyExecutor: RasterCopyExecutor,
): ViewportFrameCache {
  return new ViewportFrameCache(cacheContext, copyExecutor);
}
