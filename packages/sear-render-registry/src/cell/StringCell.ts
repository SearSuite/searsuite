import { FixBoxNode, TextNode, Node } from '@searsuite/sear-render-node';
import { Cell, CellProperties } from '../Cell';
import { CellType, formatCellText } from '@searsuite/sear-domain-cell-types';

/** Renderer for persisted plain-string cell values. */
export class StringCell extends Cell<CellProperties<string>> {
  /** Built-in string cell type symbol. */
  public static readonly symbol: symbol = Symbol.for(CellType.String);

  /** Renders text content inside a standard cell box. */
  render(): Node<CellProperties<string>> | Node<CellProperties<string>>[] {
    const { positionRect, properties, data } = this;

    if (!data.value) return new FixBoxNode(positionRect, properties);

    return new FixBoxNode(positionRect, properties).add(
      new TextNode(
        formatCellText(data.value, properties.format, this.context.cellFormatLocale),
        positionRect,
        properties,
      ),
    );
  }

  /** Returns the stored string value for measurement and formula display. */
  getDisplayText(): string {
    return this.data.value === undefined
      ? ''
      : formatCellText(this.data.value, this.properties.format, this.context.cellFormatLocale);
  }
}
