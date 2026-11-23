import { FixBoxNode, TextNode, type Node } from '@searsuite/sear-render-node';
import { Cell, type CellProperties } from '../Cell';
import { CellType } from '@searsuite/sear-domain-cell-types';

/** Draws a persisted logical cell using spreadsheet TRUE/FALSE labels. */
export class BooleanCell extends Cell<CellProperties<boolean>> {
  public static readonly symbol = Symbol.for(CellType.Boolean);

  render(): Node<CellProperties<boolean>> | Node<CellProperties<boolean>>[] {
    const { positionRect, properties, data } = this;
    const box = new FixBoxNode<CellProperties<boolean>>(positionRect, properties);
    return typeof data.value === 'boolean'
      ? box.add(new TextNode<CellProperties<boolean>>(data.value ? 'TRUE' : 'FALSE', positionRect, properties))
      : box;
  }

  getDisplayText(): string {
    return typeof this.data.value === 'boolean' ? (this.data.value ? 'TRUE' : 'FALSE') : '';
  }
}
