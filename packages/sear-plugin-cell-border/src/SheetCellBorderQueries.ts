import { defineSheetQuery, type SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { type CellBorderMatrix } from './CellBorderMatrix';
import { type SheetCellBorder } from './SheetCellBorder';
import { normalizeBorderRange } from './CellBorderRange';

/** Typed read of the explicit edges at one cell. */
export const ReadSheetCellBorderQuery = defineSheetQuery<{ row: number; column: number }, SheetCellBorder | null>(
  'sheet.cellBorder.read',
);

/** Registers read-only queries without exposing another owner's state key. */
export function registerCellBorderQueries(queries: SheetQueryRegistry, read: () => CellBorderMatrix): void {
  queries.register(ReadSheetCellBorderQuery, ({ row, column }) => {
    const matrix = read();
    normalizeBorderRange({ anchor: [row, column], focus: [row, column] }, matrix.shape);
    return matrix.getItem(row, column);
  });
}
