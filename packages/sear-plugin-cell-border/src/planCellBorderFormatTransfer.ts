import { type SheetFormatRange, type SheetFormatTransferPlan, type PluginKey } from '@searsuite/sear-assembly-plugin';
import { createUpdateCellOTOperation } from '@searsuite/sear-domain-ot';
import { type CellBorderMatrix } from './CellBorderMatrix';
import { CellBorderNeighbors } from './CellBorderNeighbors';
import { SheetBorderSide, type SheetCellBorder, type SheetBorderStroke } from './SheetCellBorder';

/** Plans canonical shared edges, including opposing-neighbor cleanup. */
export function planCellBorderFormatTransfer(
  target: PluginKey,
  current: CellBorderMatrix,
  destination: SheetFormatRange,
  formats: ReadonlyMap<number, SheetCellBorder>,
  width: number,
  height: number,
): readonly SheetFormatTransferPlan[] {
  const updates = new Map<
    string,
    { row: number; column: number; value: Partial<Record<SheetBorderSide, SheetBorderStroke>> }
  >();
  const edit = (row: number, column: number, side: SheetBorderSide, stroke: SheetBorderStroke | null) => {
    if (row < 0 || column < 0 || row >= current.shape[0] || column >= current.shape[1]) return;
    const key = `${row}:${column}`;
    const update = updates.get(key) ?? { row, column, value: { ...current.getItem(row, column) } };
    if (stroke) update.value[side] = { ...stroke };
    else delete update.value[side];
    updates.set(key, update);
  };
  const applyCell = (row: number, column: number) => {
    const format = formats.get(
      ((row - destination.start[0]) % height) * width + ((column - destination.start[1]) % width),
    );
    for (const side of Object.values(SheetBorderSide)) {
      const [dr, dc, opposite] = CellBorderNeighbors[side];
      edit(row + dr, column + dc, opposite, null);
      edit(row, column, side, format?.[side] ?? null);
    }
  };
  if (formats.size) {
    for (let row = destination.start[0]; row <= destination.end[0]; row++) {
      for (let column = destination.start[1]; column <= destination.end[1]; column++) applyCell(row, column);
    }
  } else {
    const cells = new Set<string>();
    const collect = (row: number, column: number) => {
      if (
        row >= destination.start[0] &&
        row <= destination.end[0] &&
        column >= destination.start[1] &&
        column <= destination.end[1]
      )
        cells.add(`${row}:${column}`);
    };
    current.forEachStoredInRange(
      Math.max(0, destination.start[0] - 1),
      Math.max(0, destination.start[1] - 1),
      Math.min(current.shape[0] - 1, destination.end[0] + 1),
      Math.min(current.shape[1] - 1, destination.end[1] + 1),
      (border, row, column) => {
        collect(row, column);
        for (const side of Object.values(SheetBorderSide)) {
          if (!border?.[side]) continue;
          const [dr, dc] = CellBorderNeighbors[side];
          collect(row + dr, column + dc);
        }
      },
    );
    cells.forEach((key) => {
      const [row, column] = key.split(':').map(Number);
      applyCell(row, column);
    });
  }
  const operations = [...updates.values()].flatMap(({ row, column, value }) => {
    const previous = current.getItem(row, column);
    const next: SheetCellBorder | null = Object.keys(value).length ? value : null;
    return JSON.stringify(previous) === JSON.stringify(next)
      ? []
      : [createUpdateCellOTOperation([row, column], next, previous)];
  });
  return operations.length ? [{ target, operations }] : [];
}
