import { type CellFormatTransferRegistry } from '@searsuite/sear-domain-cell-types';
import { type PluginKey, type SheetFormatTransferContribution } from '@searsuite/sear-assembly-plugin';
import { createUpdateCellOTOperation, type Operation } from '@searsuite/sear-domain-ot';
import { type SheetMatrix } from '../../SheetMatrix';

interface InlineFormatCapture {
  readonly width: number;
  readonly height: number;
  readonly formats: readonly (readonly [number, Readonly<Record<string, unknown>>])[];
}

/** Transfers type-owned cell formatting while preserving target cell data. */
export function createSheetDataFormatTransfer(
  target: PluginKey,
  readMatrix: () => SheetMatrix,
  codecs: CellFormatTransferRegistry,
): Required<Omit<SheetFormatTransferContribution, 'singleCellFillStep'>> {
  return {
    id: 'sheet.data.inlineFormat',
    usedExtent(lastRow, lastColumn) {
      let row = -1;
      let column = -1;
      readMatrix().forEachStoredInRange(0, 0, lastRow, lastColumn, (cell, currentRow, currentColumn) => {
        if (cell == null) return;
        row = Math.max(row, currentRow);
        column = Math.max(column, currentColumn);
      });
      return row < 0 ? null : [row, column];
    },
    planCaptured: (portable, destination) => planCapturedInlineFormats(
      target, readMatrix(), codecs, portable as InlineFormatCapture, destination,
    ),
    clear: (range) => {
      const operations: Operation[] = [];
      readMatrix().forEachStoredInRange(...range.start, ...range.end, (previous, row, column) => {
        const value = codecs.apply(previous, {});
        if (JSON.stringify(value) !== JSON.stringify(previous))
          operations.push(createUpdateCellOTOperation([row, column], value, previous));
      });
      return operations.length ? [{ target, operations }] : [];
    },
    capture(source) {
      const width = source.end[1] - source.start[1] + 1;
      const height = source.end[0] - source.start[0] + 1;
      const formats = new Map<number, Readonly<Record<string, unknown>>>();
      readMatrix().forEachStoredInRange(...source.start, ...source.end, (cell, row, column) => {
        const format = codecs.capture(cell);
        if (Object.keys(format).length)
          formats.set((row - source.start[0]) * width + column - source.start[1], JSON.parse(JSON.stringify(format)));
      });
      const portable: InlineFormatCapture = { width, height, formats: [...formats] };
      return { portable, plan: (destination) => planCapturedInlineFormats(target, readMatrix(), codecs, portable, destination) };
    },
  };
}

function planCapturedInlineFormats(
  target: PluginKey,
  matrix: SheetMatrix,
  codecs: CellFormatTransferRegistry,
  { width, height, formats: entries }: InlineFormatCapture,
  destination: Parameters<NonNullable<SheetFormatTransferContribution['capture']>>[0],
) {
  const operations: Operation[] = [];
  const formats = new Map(entries);
  matrix.forEachStoredInRange(...destination.start, ...destination.end, (previous, row, column) => {
    const key = ((row - destination.start[0]) % height) * width + ((column - destination.start[1]) % width);
    const value = codecs.apply(previous, formats.get(key) ?? {});
    if (JSON.stringify(value) !== JSON.stringify(previous))
      operations.push(createUpdateCellOTOperation([row, column], value, previous));
  });
  return operations.length ? [{ target, operations }] : [];
}
