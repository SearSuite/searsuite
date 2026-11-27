import { type SheetFilterPlugin } from '@searsuite/sear-plugin-filter';
import { CellVisualIconShape } from '@searsuite/sear-domain-cell-types';
import { type SheetCellVisualReaderRegistry } from '@searsuite/sear-render-registry';

/** Adds header affordances from a semantic filter-header query. */
export function registerSheetFilterVisuals(
  registry: SheetCellVisualReaderRegistry,
  source: Pick<SheetFilterPlugin, 'isHeaderCell'>,
): () => void {
  return registry.registerConditional({
    id: 'sheet.filter.header',
    properties: ['contentInsetEnd'],
    read: ({ rowIndex, columnIndex }) =>
      source.isHeaderCell(rowIndex, columnIndex)
        ? [
            {
              id: 'sheet.filter.header',
              priority: 0,
              properties: { contentInsetEnd: 22 },
              layers: [
                {
                  slot: 'filter.header.arrow',
                  x: 0.8,
                  y: 0,
                  width: 0.2,
                  height: 1,
                  icon: { shape: CellVisualIconShape.Down, color: '#526477' },
                },
              ],
            },
          ]
        : [],
  });
}
