import { SheetFormulaPriority } from '@searsuite/sear-assembly-sheet-kernel';
import { type Container } from '@searsuite/sear-foundation-di';
import { DataEngine } from '@searsuite/sear-domain-state';
import { readSheetRowSizes, readSheetColumnSizes } from '@searsuite/sear-domain-sheet';
import { type DimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import { type ScrollManager } from '@searsuite/sear-render-scroll';
import { computeViewportRange } from '@searsuite/sear-render';

/** Publishes the visual host's visible-cell projection as formula work priority. */
export function bindSheetFormulaPriority(container: Container, scroll: ScrollManager): void {
  const data = container.resolve<DataEngine>(DataEngine.symbol);
  container.resolve<SheetFormulaPriority>(SheetFormulaPriority.symbol).bind({
    readRange() {
      const rows = readSheetRowSizes(data),
        columns = readSheetColumnSizes(data);
      return rows && columns
        ? computeViewportRange(scroll, rows, columns)
        : { startRow: 0, endRow: -1, startCol: 0, endCol: -1 };
    },
    readOrigin() {
      const rows = readSheetRowSizes(data),
        columns = readSheetColumnSizes(data),
        { x, y } = scroll.getState();
      return {
        row: rows ? firstVisibleDimensionIndex(rows, y) : 0,
        col: columns ? firstVisibleDimensionIndex(columns, x) : 0,
      };
    },
    subscribe: (listener) => scroll.subscribeScroll(listener),
  });
}
function firstVisibleDimensionIndex(dimensions: DimensionsCSRMatrix, offset: number): number {
  const count = dimensions.shape[1];
  if (count === 0) return 0;
  const position = Math.min(Math.max(offset, 0), dimensions.getDimensionRightBoundaryByIndex(count - 1));
  if (dimensions.getDimensionRightBoundaryByIndex(0) > position) return 0;
  return Math.min(dimensions.getLeftBoundaryColIndexByDimension(position) + 1, count - 1);
}
