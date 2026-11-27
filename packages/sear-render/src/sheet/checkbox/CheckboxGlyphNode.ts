import { CheckboxCellType } from '@searsuite/sear-plugin-checkbox';
import { CheckboxGlyphRole } from './CheckboxRenderContract';
import { FixBoxNode, type ClipRegion } from '@searsuite/sear-render-node';
import { type RenderContext } from '@searsuite/sear-render-context';
import { type CellProperties } from '@searsuite/sear-render-registry';
/** Portable checkbox symbol; its own bounds are the pointer hit region. */
export class CheckboxGlyphNode extends FixBoxNode<CellProperties<boolean>> {
  /** Paints the symbol using paths supported by every render adapter. */ public override drawScene(
    context: RenderContext,
    _clip?: ClipRegion,
  ): void {
    context.beginNodeSemantics({
      owner: CheckboxCellType,
      role: this.properties.value ? CheckboxGlyphRole.Checked : CheckboxGlyphRole.Unchecked,
    });
    context.save();
    if (_clip) {
      context.beginPath();
      if (Array.isArray(_clip)) {
        _clip.forEach((p, i) => (i ? context.lineTo(...p) : context.moveTo(...p)));
        context.closePath();
      } else context.rect(_clip.x, _clip.y, _clip.width, _clip.height);
      context.clip();
    }
    context.beginPath();
    context.rect(this.x, this.y, this.width, this.height);
    context.setFillStyle(this.properties.value ? '#256cfb' : '#ffffff');
    context.fill();
    context.setStrokeStyle(this.properties.value ? '#256cfb' : '#737b88');
    context.setLineWidth(1);
    context.stroke();
    if (this.properties.value) {
      context.beginPath();
      context.moveTo(this.x + this.width * 0.2, this.y + this.height * 0.52);
      context.lineTo(this.x + this.width * 0.43, this.y + this.height * 0.75);
      context.lineTo(this.x + this.width * 0.82, this.y + this.height * 0.25);
      context.setStrokeStyle('#ffffff');
      context.setLineWidth(Math.max(1, this.width / 8));
      context.stroke();
    }
    context.restore();
    context.endNodeSemantics();
  }
}
