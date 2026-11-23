import { RenderNode, type ClipRegion } from '@searsuite/sear-render-node';
import { type RenderContext } from '@searsuite/sear-render-context';
import { type CellProperties } from '@searsuite/sear-render-registry';
import { BorderLinePaint } from './BorderLinePaint';
import { type SheetBorderStroke } from './SheetCellBorder';

/** Exact world-coordinate segment contributed by the border renderer. */
export interface BorderLineSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/** Visual-only custom-border segment, including double and slanted line styles. */
export class CellBorderLineNode extends RenderNode<CellProperties> {
  public constructor(private readonly line: BorderLineSegment, private readonly border: SheetBorderStroke) {
    const padding = 3;
    super(
      {
        x: Math.min(line.x1, line.x2) - padding,
        y: Math.min(line.y1, line.y2) - padding,
        width: Math.abs(line.x2 - line.x1) + padding * 2,
        height: Math.abs(line.y2 - line.y1) + padding * 2,
      },
      { type: 'sheet-cell-border', depth: 2, skipHit: true },
    );
  }
  public drawScene(context: RenderContext, _clipRegion?: ClipRegion): void {
    const paint = BorderLinePaint[this.border.style];
    const horizontal = this.line.y1 === this.line.y2;
    context.save();
    context.setStrokeStyle(this.border.color);
    context.setLineWidth(paint.width);
    context.setLineDash([...paint.dash]);
    for (const offset of paint.double ? [-2, 2] : [0]) {
      context.beginPath();
      context.moveTo(this.line.x1 + (horizontal ? 0 : offset), this.line.y1 + (horizontal ? offset : 0));
      context.lineTo(this.line.x2 + (horizontal ? 0 : offset), this.line.y2 + (horizontal ? offset : 0));
      context.stroke();
    }
    if (paint.slanted) {
      context.setLineDash([]);
      const length = horizontal ? this.line.x2 - this.line.x1 : this.line.y2 - this.line.y1;
      context.beginPath();
      for (let distance = 0; distance < length; distance += 16) {
        const x = this.line.x1 + (horizontal ? distance : 0);
        const y = this.line.y1 + (horizontal ? 0 : distance);
        context.moveTo(x - 1, y + 1);
        context.lineTo(x + 1, y - 1);
      }
      context.stroke();
    }
    context.restore();
  }
  public clear(context: RenderContext): void {
    const rect = this.positionRect;
    context.clearRect(rect.x, rect.y, rect.width, rect.height);
  }
  public drawHit(): void {}
}
