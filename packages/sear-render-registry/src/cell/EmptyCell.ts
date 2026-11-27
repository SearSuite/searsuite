import { FixBoxNode, TextNode, Node } from '@searsuite/sear-render-node';
import { Cell, CellProperties } from '../Cell';
import {
  CellType,
  formatCellNumberDisplay,
  formatCellText,
  normalizeCellFormat,
  SheetHorizontalAlignment,
} from '@searsuite/sear-domain-cell-types';
import { EmbeddedEditorRenderNode } from './EmbeddedEditorRenderNode';
import { formatFormulaValue } from '@searsuite/sear-domain-cell-types';
import { HexColor } from '@searsuite/sear-foundation-utils';

/** Renderer for empty persisted cells and active empty editor cells. */
export class EmptyCell extends Cell<CellProperties<null>> {
  /** Built-in empty cell type symbol. */
  public static readonly symbol: symbol = Symbol.for(CellType.Empty);

  /** Renders an empty box or editable rich-text placeholder. */
  render(): Node<CellProperties<null>> | Node<CellProperties<null>>[] {
    const { positionRect, properties } = this;

    const { isEdit } = properties;
    if (isEdit) {
      return new FixBoxNode(positionRect, properties).add(new EmbeddedEditorRenderNode([], positionRect, properties));
    }

    const value = this.#readResult();
    const displayValue = this.getDisplayText();
    if (!displayValue) return new FixBoxNode(positionRect, properties);
    const format = this.#getEffectiveFormat();
    const numericDisplay =
      typeof value === 'number' ? formatCellNumberDisplay(value, format, this.context.cellFormatLocale) : null;
    const boxProperties: CellProperties<null> = {
      ...properties,
      horizontalAlign:
        typeof value === 'number' && properties.horizontalAlign === undefined
          ? SheetHorizontalAlignment.Right
          : properties.horizontalAlign,
    };
    const textProperties: CellProperties<null> = {
      ...properties,
      ...(typeof value === 'number' ? { textOverflowWidth: positionRect.width } : {}),
      ...(displayValue.startsWith('#') ? { textColor: '#FF0000' as HexColor } : {}),
      ...(numericDisplay?.color === undefined ? {} : { textColor: numericDisplay.color }),
      ...(numericDisplay?.fillCharacter === undefined ? {} : { textFillCharacter: numericDisplay.fillCharacter }),
      ...(typeof value === 'number' && normalizeCellFormat(format).kind === 'general' ? { fitNumberValue: value } : {}),
    };
    return new FixBoxNode(positionRect, boxProperties).add(new TextNode(displayValue, positionRect, textProperties));
  }

  /** Returns the formatted projection when a formula spills into this cell. */
  getDisplayText(): string {
    const value = this.#readResult();
    return typeof value === 'number'
      ? formatCellNumberDisplay(value, this.#getEffectiveFormat(), this.context.cellFormatLocale).text
      : formatCellText(formatFormulaValue(value), this.properties.format, this.context.cellFormatLocale);
  }

  #readResult(): unknown {
    const { row, col, formulaResultProvider } = this.context;
    return row === void 0 || col === void 0 ? undefined : formulaResultProvider?.getFormulaResult(row, col);
  }

  #getEffectiveFormat(): unknown {
    const { row, col, formulaResultProvider } = this.context;
    return (
      this.properties.format ??
      (row === void 0 || col === void 0 ? undefined : formulaResultProvider?.getFormulaResultFormat?.(row, col))
    );
  }
}
