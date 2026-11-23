import { type SheetConfig } from '@searsuite/sear-assembly-config';
import { type RichDocNode, paraText } from '@searsuite/sear-domain-doc';
import { createFontDescriptor, type TextShaper } from '@searsuite/sear-render-metrics';
import { SheetHorizontalAlignment } from '@searsuite/sear-plugin-alignment';

/** Read surface needed to measure text extending beyond an edited cell. */
export interface CellEditorOverflowFields {
  readonly cellAlignments?: {
    getItem(row: number, column: number): string | null | undefined;
  } | null;
  readonly sheetData: {
    getItem(row: number, column: number): { readonly value?: unknown } | null | undefined;
  };
}

/** Returns the left edge of center/right-aligned text, or the cell edge when it does not overflow. */
export function computeCellEditorOverflowLeftX(
  config: Partial<SheetConfig>,
  state: CellEditorOverflowFields,
  textShaper: Pick<TextShaper, 'shape'> | undefined,
  anchor: readonly [number, number],
  cellLeftX: number,
  baseWidth: number,
  cellPadding: number,
): number {
  const explicitAlign = state.cellAlignments?.getItem(anchor[0], anchor[1]);
  const horizontalAlign = explicitAlign ?? config.defaultCellAlign ?? SheetHorizontalAlignment.Left;
  if (horizontalAlign === SheetHorizontalAlignment.Left) return cellLeftX;

  const rawValue = state.sheetData.getItem(anchor[0], anchor[1])?.value;
  let plainText: string;
  if (Array.isArray(rawValue)) plainText = (rawValue as RichDocNode[]).map(paraText).join('\n');
  else if (typeof rawValue === 'string' || typeof rawValue === 'number') plainText = String(rawValue);
  else return cellLeftX;
  if (!plainText || !textShaper) return cellLeftX;

  const metrics = textShaper.shape({
    text: plainText,
    font: createFontDescriptor({
      fontSize: config.sheetCellFontSize ?? 10,
      fontFamily: config.sheetCellFontFamily ?? 'sans-serif',
    }),
  });
  let textX = cellLeftX + cellPadding;
  if (horizontalAlign === SheetHorizontalAlignment.Center)
    textX += (baseWidth - 2 * cellPadding - metrics.width) / 2;
  else if (horizontalAlign === SheetHorizontalAlignment.Right)
    textX = cellLeftX + baseWidth - cellPadding - metrics.width;
  return Math.min(textX, cellLeftX);
}
