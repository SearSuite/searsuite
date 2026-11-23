import { RenderContext, type RenderImageSource } from '@searsuite/sear-render-context';
import { Injectable } from '@searsuite/sear-foundation-di';

import { type RasterCopyRect } from './RasterCopyPlan';

/**
 * Executes raster copies between render contexts with transform isolation.
 *
 * The executor owns the identity-transform save/restore wrapper used by Canvas
 * viewport copy paths. Retained targets can avoid this executor entirely by
 * selecting a full-frame rebuild through context capabilities.
 */
@Injectable()
export class RasterCopyExecutor {
  /** DI token for resolving RasterCopyExecutor. */
  public static readonly symbol = Symbol.for('RasterCopyExecutor');

  /**
   * Copies a rectangular pixel region from one render target into another.
   *
   * @param source Source render context.
   * @param destination Destination render context.
   * @param copy Source and destination rectangles in viewport coordinates.
   */
  public copy(source: RenderContext, destination: RenderContext, copy: RasterCopyRect): void {
    destination.save();
    destination.setTransform(1, 0, 0, 1, 0, 0);
    destination.drawImage(
      source.getRenderTarget() as RenderImageSource,
      copy.destination.x,
      copy.destination.y,
      copy.destination.width,
      copy.destination.height,
      copy.source.x,
      copy.source.y,
      copy.source.width,
      copy.source.height,
    );
    destination.restore();
  }

  /**
   * Copies the source target at its natural size to a viewport-space origin.
   *
   * This keeps initial off-screen cache priming compatible with existing Canvas
   * behavior where the complete visible backing store is cloned after first
   * paint.
   *
   * @param source Source render context.
   * @param destination Destination render context.
   * @param x Destination x-coordinate.
   * @param y Destination y-coordinate.
   */
  public copyNatural(source: RenderContext, destination: RenderContext, x: number = 0, y: number = 0): void {
    destination.save();
    destination.setTransform(1, 0, 0, 1, 0, 0);
    destination.drawImage(source.getRenderTarget() as RenderImageSource, x, y);
    destination.restore();
  }
}
