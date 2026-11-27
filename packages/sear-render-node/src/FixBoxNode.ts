import { type ClipRegion } from './Node';
import { RenderNode } from './RenderNode';
import { RenderContext } from '@searsuite/sear-render-context';

import { Platform } from '@searsuite/sear-foundation-platform';
import { NodeProperties } from './types';

/** Scene node that renders a rectangular box with optional fill, stroke, and clipping. */
export class FixBoxNode<T extends NodeProperties> extends RenderNode<T> {
  /**
   * Draws the box into the visible render context.
   * @param context - Render context receiving draw commands.
   * @param clipRegion - Optional rectangle or polygon clipping region.
   */
  public drawScene(context: RenderContext, clipRegion?: ClipRegion): void {
    context.save();
    if (clipRegion) {
      if (Array.isArray(clipRegion)) {
        if (clipRegion.length >= 3) {
          context.beginPath();
          context.moveTo(clipRegion[0][0], clipRegion[0][1]);
          for (let i = 1; i < clipRegion.length; i++) {
            context.lineTo(clipRegion[i][0], clipRegion[i][1]);
          }
          context.closePath();
          context.clip();
        }
      } else {
        context.beginPath();
        context.rect(clipRegion.x, clipRegion.y, clipRegion.width, clipRegion.height);
        context.clip();
      }
    }

    context.beginPath();
    const lineWidth = Math.max(0, this.strokeWidth ?? 0);
    // Pixel-align odd-width strokes (1,3,...) on half-pixels; keep even widths on integer pixels.
    const offset = lineWidth > 0 && lineWidth % 2 === 1 ? 0.5 : 0;
    context.rect(this.x + offset, this.y + offset, this.width - 2 * offset, this.height - 2 * offset);

    if (this.fill) {
      context.setFillStyle(this.fill);
      context.fill();
    }
    if (this.stroke !== void 0) context.setStrokeStyle(this.stroke);
    if (this.strokeWidth !== void 0) context.setLineWidth(this.strokeWidth);
    if (this.lineDash) context.setLineDash(this.lineDash);
    context.stroke();
    if (this.lineDash) context.setLineDash([]);

    context.restore();
  }

  /**
   * Clears this node's bounds from a raster context using stroke padding.
   * @param context - Render context to clear.
   */
  public clear(context: RenderContext) {
    context.save();
    const lineWidth = context.getLineWidth();
    context.clearRect(
      this.positionRect.x - lineWidth / 2,
      this.positionRect.y - lineWidth / 2,
      this.positionRect.width + lineWidth,
      this.positionRect.height + lineWidth,
    );
    context.restore();
  }

  /**
   * Draws the node into the hit-test context unless the node is visual-only.
   * @param context - Hit render context.
   */
  public drawHit(context: RenderContext): void {
    // Visual-only nodes (for example selection strokes and header highlight backgrounds)
    // should not paint the Hit Canvas; otherwise they can cover cell hit colors and block click-through.
    if (this.properties.skipHit) return;
    if (!this.randomColorKey) {
      this.resolveRuntime<Platform>(Platform.symbol).warn(
        'FixBoxNode drawHit skipped: randomColorKey is missing for a hit-enabled node.',
        {
          nodeName: this.name,
          positionRect: this.positionRect,
        },
      );
      return;
    }

    context.save();

    context.beginPath();
    context.rect(this.x, this.y, this.width, this.height);

    context.setFillStyle(this.randomColorKey);

    context.fill();

    context.restore();
  }
}
