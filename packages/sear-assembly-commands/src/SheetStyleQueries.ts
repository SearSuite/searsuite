import { type SheetCellStyle } from '@searsuite/sear-domain-cell-types';
import { defineSheetQuery } from './SheetQueryDefinition';

/** Reads composed semantic appearance without constructing a view. */
export const ReadSheetCellStyleQuery = defineSheetQuery<readonly [number, number], Readonly<SheetCellStyle>>(
  'sheet.styles.readCell',
);
