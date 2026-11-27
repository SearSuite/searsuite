import { type SheetCellStyleReader } from '@searsuite/sear-domain-cell-types';
import { type SheetCellVisualReaderRegistry } from '@searsuite/sear-render-registry';

/** Presents the core's composed style without duplicating feature evaluation. */
export function registerSheetCellStyleView(
  registry: SheetCellVisualReaderRegistry,
  styles: SheetCellStyleReader,
): () => void {
  return registry.register({
    id: 'sheet.core-style',
    properties: ['fill', 'textColor', 'stroke', 'format', 'horizontalAlign', 'verticalAlign'],
    read: ({ rowIndex, columnIndex }) => styles.read(rowIndex, columnIndex),
  });
}
