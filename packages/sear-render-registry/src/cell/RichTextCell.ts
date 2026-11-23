import { FixBoxNode, Node } from '@searsuite/sear-render-node';
import { Cell, CellProperties } from '../Cell';
import { CellType, formatCellText } from '@searsuite/sear-domain-cell-types';
import { extractRichText } from './DisplayTextUtils';
import { EmbeddedEditorRenderNode } from './EmbeddedEditorRenderNode';
import type { SheetDocumentNode } from '@searsuite/sear-sheet-editor-contract';

/** Renderer for persisted rich-text cell values. */
export class RichTextCell extends Cell<CellProperties<SheetDocumentNode[]>> {
  /** Built-in rich-text cell type symbol. */
  public static readonly symbol: symbol = Symbol.for(CellType.RichText);

  /** Renders a rich-text document inside the cell bounds. */
  render(): Node<CellProperties<SheetDocumentNode[]>> | Node<CellProperties<SheetDocumentNode[]>>[] {
    const { positionRect, properties, data } = this;

    if (!data.value || !Array.isArray(data.value) || !this.getDisplayText()) {
      return new FixBoxNode(positionRect, properties);
    }

    return new FixBoxNode(positionRect, properties).add(
      new EmbeddedEditorRenderNode(data.value, positionRect, properties),
    );
  }

  /** Extracts plain text from the rich-text document. */
  getDisplayText(): string {
    return formatCellText(extractRichText(this.data.value), this.properties.format, this.context.cellFormatLocale);
  }
}
