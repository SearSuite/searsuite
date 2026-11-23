import { FixBoxNode, Node } from '@searsuite/sear-render-node';
import { Cell, CellProperties, CellRenderType } from '../Cell';
import { extractRichText } from './DisplayTextUtils';
import { EmbeddedEditorRenderNode } from './EmbeddedEditorRenderNode';
import type { SheetDocumentNode } from '@searsuite/sear-sheet-editor-contract';

/** Rendering-only cell used by the inline rich-text editor overlay. */
export class EditorCell extends Cell<CellProperties<SheetDocumentNode[]>> {
  /** Built-in editor cell type symbol. */
  public static readonly symbol: symbol = Symbol.for(CellRenderType.Editor);

  /** Renders editor content, marking edit-mode nodes as overlay content when needed. */
  render(): Node<CellProperties<SheetDocumentNode[]>> | Node<CellProperties<SheetDocumentNode[]>>[] {
    const { positionRect, properties, data } = this;
    if (!data.value) return new FixBoxNode(positionRect, properties);

    if (data.isEdit) {
      return [
        new FixBoxNode(positionRect, properties).add(
          new EmbeddedEditorRenderNode(data.value, positionRect, {
            ...properties,
            isEdit: true,
          }),
        ),
      ];
    }

    return [
      new FixBoxNode(positionRect, properties).add(
        new EmbeddedEditorRenderNode(data.value, positionRect, properties),
      ),
    ];
  }

  /** Extracts plain text from the editor document. */
  getDisplayText(): string {
    return extractRichText(this.data.value);
  }
}
