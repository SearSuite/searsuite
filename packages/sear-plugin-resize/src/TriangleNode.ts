import { PositionRect, type PositionRectProps } from '@searsuite/sear-foundation-rect';
import { RenderContext } from '@searsuite/sear-render-context';
import { Node, type ClipRegion, type NodeProperties } from '@searsuite/sear-render-node';

/** Lightweight retained triangle used for row and column resize handles. */
export class TriangleNode<T extends NodeProperties> extends Node<T> {
  /** @inheritdoc */
  public override sticky = true;
  private readonly points: [number, number][];

  /** Creates a TriangleNode instance. */
  public constructor(positionRect: PositionRectProps, props: Partial<T>, points: [number, number][]) {
    super(positionRect, props);
    this.points = points;
  }

  /** Draws this handle into the visible scene context. */
  public drawScene(context: RenderContext, _clipRegion?: ClipRegion): void {
    if (!this.points.length) return;
    context.save();
    context.beginPath();
    context.moveTo(this.points[0][0], this.points[0][1]);
    for (let i = 1; i < this.points.length; i++) context.lineTo(this.points[i][0], this.points[i][1]);
    context.closePath();
    if (this.fill) {
      context.setFillStyle(this.fill);
      context.fill();
    }
    context.restore();
  }

  /** Clears state owned by TriangleNode. */
  public clear(context: RenderContext): void {
    context.save();
    context.clearRect(
      this.positionRect.x - 1,
      this.positionRect.y - 1,
      this.positionRect.width + 2,
      this.positionRect.height + 2,
    );
    context.restore();
  }

  /** Draws this handle into the hit-test context. */
  public drawHit(context: RenderContext): void {
    if (this.properties.skipHit) return;
    context.save();
    context.beginPath();
    context.rect(this.x, this.y, this.width, this.height);
    if (this.randomColorKey) context.setFillStyle(this.randomColorKey);
    context.fill();
    context.restore();
  }
}
