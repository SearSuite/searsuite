import { SheetHorizontalAlignment, SheetVerticalAlignment } from '@searsuite/sear-domain-cell-types';

/** Configuration owned by a standalone Sheet editor. */
export interface SheetConfig {
  readonly devicePixelRatio: number;
  readonly cellPadding: number;
  readonly sheetOffsetX: number;
  readonly sheetOffsetY: number;
  readonly defaultCellAlign: SheetHorizontalAlignment;
  readonly defaultCellVerticalAlign: SheetVerticalAlignment;
  readonly defaultRowSize: number;
  readonly defaultColumnSize: number;
  readonly sheetCellFontSize: number;
  readonly sheetCellFontFamily: string;
}

/** Built-in defaults for ordinary Sheet cells and Sheet viewport services. */
export const defaultSheetConfig: SheetConfig = {
  devicePixelRatio: 4,
  cellPadding: 4,
  sheetOffsetX: 50,
  sheetOffsetY: 24,
  defaultCellAlign: SheetHorizontalAlignment.Left,
  defaultCellVerticalAlign: SheetVerticalAlignment.Center,
  defaultRowSize: 24,
  defaultColumnSize: 100,
  sheetCellFontSize: 10,
  sheetCellFontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
};
