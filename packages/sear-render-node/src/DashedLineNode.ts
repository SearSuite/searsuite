import { RenderContext } from '@searsuite/sear-render-context';
import { type ClipRegion } from './Node';
import { RenderNode } from './RenderNode';
import { NodeProperties } from './types';
import { PositionRectProps } from '@searsuite/sear-foundation-rect';

/** Scene node that renders one dashed line segment. */
export class DashedLineNode<T extends NodeProperties> extends RenderNode<T> {
  /** Start x-coordinate. */
  private readonly lineX1: number;
  /** Start y-coordinate. */
  private readonly lineY1: number;
  /** End x-coordinate. */
  private readonly lineX2: number;
  /** End y-coordinate. */
  private readonly lineY2: number;

  /**
   * Constructs a dashed line node.
   * @param positionRect - Dirty/hit bounds covering the line.
   * @param props - Render properties including stroke and dash pattern.
   * @param line - Exact line segment coordinates.
   */
  constructor(
    positionRect: PositionRectProps,
    props: Partial<T>,
    line: { x1: number; y1: number; x2: number; y2: number },
  ) {
    super(positionRect, props);
    this.lineX1 = line.x1;
    this.lineY1 = line.y1;
    this.lineX2 = line.x2;
    this.lineY2 = line.y2;
  }

  /**
   * Draws the dashed line into the render context.
   * @param context - Render context receiving draw commands.
   */
  public drawScene(context: RenderContext, clipRegion?: ClipRegion): void {
    context.save();
    context.beginPath();
    context.moveTo(this.lineX1, this.lineY1);
    context.lineTo(this.lineX2, this.lineY2);
    if (this.stroke) context.setStrokeStyle(this.stroke);
    if (this.strokeWidth) context.setLineWidth(this.strokeWidth);
    if (this.lineDash) context.setLineDash(this.lineDash);
    context.stroke();
    if (this.lineDash) context.setLineDash([]);
    context.restore();
  }

  /**
   * Clears the line bounds with stroke padding.
   * @param context - Render context to clear.
   */
  public clear(context: RenderContext): void {
    context.save();
    const padding = Math.max(this.strokeWidth, 2);
    context.clearRect(
      this.positionRect.x - padding,
      this.positionRect.y - padding,
      this.positionRect.width + padding * 2,
      this.positionRect.height + padding * 2,
    );
    context.restore();
  }

  /** Dashed lines are visual-only and do not participate in hit testing. */
  public drawHit(): void {
    // visual-only, no hit
  }
}
