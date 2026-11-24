import { AffixNode } from './AffixNode';
import { type NodeProperties } from './types';
import { type RenderContext } from '@searsuite/sear-render-context';
import { type ClipRegion } from './Node';
import { applyClip } from './RichTextRenderNodeUtils';

/** Paints the sheet's select-all marker inside the corner's rectangular hit area. */
export class SheetCornerNode<T extends NodeProperties> extends AffixNode<T> {
  public override drawScene(context: RenderContext, clipRegion?: ClipRegion): void {
    context.save();
    applyClip(context, clipRegion);
    super.drawScene(context);

    const inset = 4;
    const size = Math.min(12, this.width - 2 * inset, this.height - 2 * inset);
    if (size > 0) {
      const right = this.x + this.width - inset;
      const bottom = this.y + this.height - inset;
      context.beginPath();
      context.moveTo(right, bottom - size);
      context.lineTo(right, bottom);
      context.lineTo(right - size, bottom);
      context.closePath();
      context.setFillStyle(this.properties.textColor ?? '#9ca3af');
      context.fill();
    }
    context.restore();
  }
}
