import { Node, AffixNode, AffixTextNode, SheetCornerNode } from '@searsuite/sear-render-node';
import { Cell, CellProperties, CellRegion, CellRenderType } from '../Cell';
import { extractRichText } from '@searsuite/sear-domain-cell-types';
import type { SheetDocumentNode } from '@searsuite/sear-sheet-editor-contract';

/** Rendering-only cell used for fixed row/column header affixes. */
export class AffixCell extends Cell<CellProperties<string | number | null | SheetDocumentNode>> {
  /** Built-in affix cell type symbol. */
  public static readonly symbol: symbol = Symbol.for(CellRenderType.Affix);

  /** Renders the affix background and optional text content. */
  render():
    | Node<CellProperties<string | number | null | SheetDocumentNode>>
    | Node<CellProperties<string | number | null | SheetDocumentNode>>[] {
    const { positionRect, properties } = this;
    const node =
      properties.region === CellRegion.Corner
        ? new SheetCornerNode(positionRect, properties)
        : new AffixNode(positionRect, properties);
    const text = this.getDisplayText();
    return text ? node.add(new AffixTextNode(text, positionRect, properties)) : node;
  }

  /** Returns plain display text for numeric/string labels and rich header content. */
  getDisplayText(): string {
    const v = this.data.value;
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    if (Array.isArray(v)) return extractRichText(v);
    return '';
  }
}
