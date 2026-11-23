import { CellBorderNeighbors } from './CellBorderNeighbors';
import { type SheetRangeBounds } from '@searsuite/sear-assembly-commands';
import { createUpdateCellOTOperation, type UpdateCellOTOperation } from '@searsuite/sear-domain-ot';
import { type CellBorderMatrix } from './CellBorderMatrix';
import { SheetBorderPreset, SheetBorderSide, type SheetBorderStroke, type SheetCellBorder } from './SheetCellBorder';

/** Plans isolated cell updates, including removal of obsolete opposing neighbor edges. */
export function planCellBorders(
  matrix: CellBorderMatrix,
  range: SheetRangeBounds,
  preset: SheetBorderPreset,
  stroke: SheetBorderStroke,
): UpdateCellOTOperation<SheetCellBorder>[] {
  const updates = new Map<
    string,
    { row: number; column: number; value: Partial<Record<SheetBorderSide, SheetBorderStroke>> }
  >();
  function edit(row: number, column: number, side: SheetBorderSide, value: SheetBorderStroke | null): void {
    if (row < 0 || column < 0 || row >= matrix.shape[0] || column >= matrix.shape[1]) return;
    const key = `${row}:${column}`;
    const update = updates.get(key) ?? { row, column, value: { ...(matrix.getItem(row, column) ?? {}) } };
    if (value === null) delete update.value[side];
    else update.value[side] = { ...value };
    updates.set(key, update);
  }
  for (let row = range.start[0]; row <= range.end[0]; row += 1) {
    for (let column = range.start[1]; column <= range.end[1]; column += 1) {
      for (const side of Object.values(SheetBorderSide)) {
        if (!includesSide(preset, side, row, column, range)) continue;
        const [dr, dc, opposite] = CellBorderNeighbors[side];
        // Each shared edge has one authoritative stroke, not two overpainted values.
        edit(row + dr, column + dc, opposite, null);
        edit(row, column, side, preset === SheetBorderPreset.None ? null : stroke);
      }
    }
  }
  return [...updates.values()].flatMap(({ row, column, value }) => {
    const next = Object.keys(value).length ? value : null;
    const previous = matrix.getItem(row, column);
    return sameBorder(previous, next) ? [] : [createUpdateCellOTOperation([row, column], next, previous)];
  });
}

function includesSide(
  preset: SheetBorderPreset,
  side: SheetBorderSide,
  row: number,
  column: number,
  range: SheetRangeBounds,
): boolean {
  const outside =
    side === SheetBorderSide.Top
      ? row === range.start[0]
      : side === SheetBorderSide.Bottom
      ? row === range.end[0]
      : side === SheetBorderSide.Left
      ? column === range.start[1]
      : column === range.end[1];
  if (preset === SheetBorderPreset.All || preset === SheetBorderPreset.None) return true;
  if (preset === SheetBorderPreset.Outside) return outside;
  if (preset === SheetBorderPreset.Inside) return !outside;
  if (preset === SheetBorderPreset.Horizontal)
    return !outside && (side === SheetBorderSide.Top || side === SheetBorderSide.Bottom);
  if (preset === SheetBorderPreset.Vertical)
    return !outside && (side === SheetBorderSide.Left || side === SheetBorderSide.Right);
  return preset === side && outside;
}

function sameBorder(a: SheetCellBorder | null, b: SheetCellBorder | null): boolean {
  return Object.values(SheetBorderSide).every(
    (side) => a?.[side]?.color === b?.[side]?.color && a?.[side]?.style === b?.[side]?.style,
  );
}
