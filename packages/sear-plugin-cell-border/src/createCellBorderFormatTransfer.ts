import { planCellBorderFormatTransfer } from './planCellBorderFormatTransfer';
import { type PluginKey, type SheetFormatTransferContribution } from '@searsuite/sear-assembly-plugin';
import { type CellBorderMatrix } from './CellBorderMatrix';
import { CellBorderNeighbors } from './CellBorderNeighbors';
import { SheetBorderSide, type SheetBorderStroke } from './SheetCellBorder';

interface CellBorderCapture {
  readonly width: number;
  readonly height: number;
  readonly formats: readonly (readonly [number, Partial<Record<SheetBorderSide, SheetBorderStroke>>])[];
}

/** Captures visible shared edges and clears opposing destination edges atomically. */
export function createCellBorderFormatTransfer(
  target: PluginKey,
  readMatrix: () => CellBorderMatrix,
): Required<Omit<SheetFormatTransferContribution, 'singleCellFillStep'>> {
  return {
    id: 'sheet.cellBorder',
    usedExtent(lastRow, lastColumn) {
      let row = -1;
      let column = -1;
      readMatrix().forEachStoredInRange(0, 0, lastRow, lastColumn, (border, currentRow, currentColumn) => {
        if (border == null) return;
        row = Math.max(row, currentRow);
        column = Math.max(column, currentColumn);
      });
      return row < 0 ? null : [row, column];
    },
    clear: (range) => planCellBorderFormatTransfer(target, readMatrix(), range, new Map(), 1, 1),
    planCaptured: (portable, destination) => {
      const { formats, width, height } = portable as CellBorderCapture;
      return planCellBorderFormatTransfer(target, readMatrix(), destination, new Map(formats), width, height);
    },
    capture(source) {
      const matrix = readMatrix();
      const width = source.end[1] - source.start[1] + 1;
      const height = source.end[0] - source.start[0] + 1;
      const formats = new Map<number, Partial<Record<SheetBorderSide, SheetBorderStroke>>>();
      const priorities = new Map<string, number>();
      const add = (row: number, column: number, side: SheetBorderSide, stroke: SheetBorderStroke, priority: number) => {
        if (row < source.start[0] || row > source.end[0] || column < source.start[1] || column > source.end[1]) return;
        const key = (row - source.start[0]) * width + column - source.start[1];
        const edge = `${key}:${side}`;
        if ((priorities.get(edge) ?? -1) > priority) return;
        const format = formats.get(key) ?? {};
        format[side] = { ...stroke };
        formats.set(key, format);
        priorities.set(edge, priority);
      };
      matrix.forEachStoredInRange(
        Math.max(0, source.start[0] - 1),
        Math.max(0, source.start[1] - 1),
        Math.min(matrix.shape[0] - 1, source.end[0] + 1),
        Math.min(matrix.shape[1] - 1, source.end[1] + 1),
        (border, row, column) => {
          for (const side of Object.values(SheetBorderSide)) {
            const stroke = border?.[side];
            if (!stroke) continue;
            const priority = side === SheetBorderSide.Top || side === SheetBorderSide.Left ? 1 : 0;
            add(row, column, side, stroke, priority);
            const [dr, dc, opposite] = CellBorderNeighbors[side];
            add(row + dr, column + dc, opposite, stroke, priority);
          }
        },
      );
      const portable: CellBorderCapture = { formats: [...formats], width, height };
      return {
        portable,
        plan: (destination) => planCellBorderFormatTransfer(target, readMatrix(), destination, formats, width, height),
      };
    },
  };
}
