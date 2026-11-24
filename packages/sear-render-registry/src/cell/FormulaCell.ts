/**
 * Formula cell rendering.
 *
 * Renders the calculated result for a formula cell, provided by
 * CellContext.formulaResultProvider. Formula source text (data.formula) is not
 * displayed here; CellEditor displays it while editing.
 *
 * Error values (#DIV/0!, #REF!, #NAME?, etc.) render as red text.
 *
 * Data sources:
 * - data: CellMatrixElement containing only formula source text, not calculated results.
 * - context.formulaResultProvider: implemented by SheetFormulaPlugin; FormulaCell
 *   uses it to read this client's independent derived resultCache, which is not synced.
 *
 * Render node structure:
 * - FixBoxNode (background + border)
 *   - TextNode (calculated result text)
 */

import { FixBoxNode, TextNode, Node } from '@searsuite/sear-render-node';
import { Cell, CellProperties } from '../Cell';
import { formatFormulaValue } from './DisplayTextUtils';
import {
  CellType,
  formatCellNumberDisplay,
  formatCellText,
  normalizeCellFormat,
  SheetHorizontalAlignment,
} from '@searsuite/sear-domain-cell-types';
import { type HexColor } from '@searsuite/sear-foundation-utils';

/** Renders the calculated projection of a formula cell. */
export class FormulaCell extends Cell<CellProperties<string>> {
  /** DI token for resolving FormulaCell. */
  public static readonly symbol: symbol = Symbol.for(CellType.Formula);

  /** Renders FormulaCell scene output. */
  render(): Node<CellProperties<string>> | Node<CellProperties<string>>[] {
    const { positionRect, properties } = this;

    const displayValue = this.getDisplayText();

    if (!displayValue) {
      // Empty value: render only the background.
      return new FixBoxNode(positionRect, properties);
    }

    // Check whether this is an error value (#DIV/0!, #REF!, ...).
    const isErrorValue = displayValue.startsWith('#');

    // Create a text node.
    // Error values use red text via the properties fill color.
    // Normal values use the default color.
    //
    // Important: build FixBoxNode before TextNode. TextNode measures the text
    // width during construction and overwrites positionRect.width (see TextNode.ts).
    // Building TextNode first would give FixBoxNode the narrowed width, causing
    // the cell border/background to shrink to text width and appear left-shifted.
    const numericResult = this.#readScalarResult();
    const format = this.#getEffectiveFormat();
    const numericDisplay =
      typeof numericResult === 'number'
        ? formatCellNumberDisplay(numericResult, format, this.context.cellFormatLocale)
        : null;
    const resolvedAlignment =
      typeof numericResult === 'number' &&
      (properties.horizontalAlign === undefined || properties.horizontalAlign === SheetHorizontalAlignment.Left)
        ? SheetHorizontalAlignment.Right
        : properties.horizontalAlign;
    const boxProperties: CellProperties<string> = { ...properties, horizontalAlign: resolvedAlignment };
    const textProperties: CellProperties<string> = {
      ...properties,
      ...(this.#readHyperlink() ? { textColor: '#0563C1' as HexColor, semanticRole: 'hyperlink' } : {}),
      ...(typeof numericResult === 'number' ? { textOverflowWidth: positionRect.width } : {}),
      ...(isErrorValue ? { textColor: '#FF0000' as HexColor } : {}),
      ...(numericDisplay?.color === undefined ? {} : { textColor: numericDisplay.color }),
      ...(numericDisplay?.fillCharacter === undefined ? {} : { textFillCharacter: numericDisplay.fillCharacter }),
      ...(typeof numericResult === 'number' && normalizeCellFormat(format).kind === 'general'
        ? { fitNumberValue: numericResult }
        : {}),
    };

    return new FixBoxNode<CellProperties<string>>(positionRect, boxProperties).add(
      new TextNode<CellProperties<string>>(displayValue, positionRect, textProperties),
    );
  }

  /** Returns the display text. */
  getDisplayText(): string {
    const { row, col, formulaResultProvider: provider } = this.context;
    if (row === void 0 || col === void 0 || !provider) return '';
    const result = provider.getFormulaResult(row, col);
    if (!Array.isArray(result)) return this.#formatResult(result);
    const rows = result as unknown[];
    const firstRow = Array.isArray(rows[0]) ? rows[0] : rows;
    return this.#formatResult(firstRow[0]);
  }

  #formatResult(value: unknown): string {
    return typeof value === 'number'
      ? formatCellNumberDisplay(value, this.#getEffectiveFormat(), this.context.cellFormatLocale).text
      : formatCellText(formatFormulaValue(value), this.properties.format, this.context.cellFormatLocale);
  }

  #getEffectiveFormat(): unknown {
    const { row, col, formulaResultProvider } = this.context;
    return this.properties.format ?? (
      row === void 0 || col === void 0 ? void 0 : formulaResultProvider?.getFormulaResultFormat?.(row, col)
    );
  }

  #readScalarResult(): unknown {
    const { row, col, formulaResultProvider: provider } = this.context;
    if (row === void 0 || col === void 0 || !provider) return undefined;
    const result = provider.getFormulaResult(row, col);
    if (!Array.isArray(result)) return result;
    const rows = result as unknown[];
    const firstRow = Array.isArray(rows[0]) ? rows[0] : rows;
    return firstRow[0];
  }

  #readHyperlink(): boolean {
    const { row, col, formulaRichResultProvider } = this.context;
    return row !== undefined && col !== undefined
      && formulaRichResultProvider?.getFormulaRichResult(row, col)?.kind === 'hyperlink';
  }
}
