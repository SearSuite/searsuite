import { CheckboxGlyphRole } from './CheckboxRenderContract';
import { Cell, type CellProperties } from '@searsuite/sear-render-registry';
import { FixBoxNode } from '@searsuite/sear-render-node';
import { CheckboxCellType, checkboxText } from '@searsuite/sear-plugin-checkbox';
import { CheckboxGlyphNode } from './CheckboxGlyphNode';
/** Renders a centered symbol while leaving the rest of the cell available for selection. */
export class CheckboxCell extends Cell<CellProperties<boolean>> {
  /** Creates a glyph only for well-formed boolean values. */ public render(): FixBoxNode<CellProperties<boolean>> {
    const outer = new FixBoxNode(this.positionRect, this.properties);
    if (typeof this.data.value !== 'boolean') return outer;
    const size = Math.min(16, this.positionRect.width - 6, this.positionRect.height - 6);
    if (size < 6) return outer;
    const merged =
      (this.properties.endRowIndex ?? this.properties.startRowIndex) !== this.properties.startRowIndex ||
      (this.properties.endColIndex ?? this.properties.startColIndex) !== this.properties.startColIndex;
    const glyph = new CheckboxGlyphNode(
      {
        x: this.positionRect.x + (this.positionRect.width - size) / 2,
        y: this.positionRect.y + (this.positionRect.height - size) / 2,
        width: size,
        height: size,
      },
      {
        ...this.properties,
        depth: (this.properties.depth ?? 0) + 1,
        value: this.data.value,
        semanticOwner: CheckboxCellType,
        semanticRole: this.data.value ? CheckboxGlyphRole.Checked : CheckboxGlyphRole.Unchecked,
        nodeKey: `checkbox:${merged ? 'merged' : 'grid'}:${this.context.row ?? this.properties.startRowIndex}:${
          this.context.col ?? this.properties.startColIndex
        }`,
      },
    );
    return outer.add(glyph);
  }
  /** Preserves boolean editor, auto-size and plain-text semantics. */ public getDisplayText(): string {
    return typeof this.data.value === 'boolean' ? checkboxText(this.data.value) : '';
  }
}
