import { FixBoxNode, TextNode, Node } from '@searsuite/sear-render-node';
import { Cell, CellProperties } from '../Cell';
import {
  CellType,
  formatCellNumberDisplay,
  normalizeCellFormat,
  SheetHorizontalAlignment,
} from '@searsuite/sear-domain-cell-types';

/** Renders a persisted numeric value without converting its storage type to text. */
export class NumberCell extends Cell<CellProperties<number>> {
  /** DI token for resolving NumberCell. */
  public static readonly symbol: symbol = Symbol.for(CellType.Number);

  /** Renders NumberCell scene output. */
  render(): Node<CellProperties<number>> | Node<CellProperties<number>>[] {
    const { positionRect, properties, data } = this;
    if (typeof data.value !== 'number') return new FixBoxNode(positionRect, properties);
    const display = formatCellNumberDisplay(data.value, properties.format, this.context.cellFormatLocale);
    const textProperties: CellProperties<number> = {
      ...properties,
      horizontalAlign: properties.horizontalAlign ?? SheetHorizontalAlignment.Right,
      textOverflowWidth: positionRect.width,
      ...(display.color === undefined ? {} : { textColor: display.color }),
      ...(display.fillCharacter === undefined ? {} : { textFillCharacter: display.fillCharacter }),
      ...(normalizeCellFormat(properties.format).kind === 'general' ? { fitNumberValue: data.value } : {}),
    };
    return new FixBoxNode<CellProperties<number>>(positionRect, properties).add(
      new TextNode<CellProperties<number>>(display.text, positionRect, textProperties),
    );
  }

  /** Returns the display text. */
  getDisplayText(): string {
    return typeof this.data.value === 'number'
      ? formatCellNumberDisplay(this.data.value, this.properties.format, this.context.cellFormatLocale).text
      : '';
  }
}
