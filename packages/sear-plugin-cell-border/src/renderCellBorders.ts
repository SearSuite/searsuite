import { type SearCoreSheet } from '@searsuite/sear-assembly-core';
import { type SheetConfig } from '@searsuite/sear-assembly-config';
import { computeViewportRange, getSheetRangePositionRect } from '@searsuite/sear-render';
import { readSheetRowSizes, readSheetColumnSizes } from '@searsuite/sear-render-engine';
import { readSheetCellMerges } from '@searsuite/sear-plugin-cell-merge';
import { type CellBorderMatrix } from './CellBorderMatrix';
import { SheetBorderSide, type SheetBorderStroke } from './SheetCellBorder';
import { CellBorderLineNode, type BorderLineSegment } from './CellBorderLineNode';

/** Builds only visible edge nodes; merged interiors never receive custom strokes. */
export function renderCellBorders(core: SearCoreSheet, matrix: CellBorderMatrix): CellBorderLineNode[] {
  const engine = core.getDataEngine();
  const rowSizes = readSheetRowSizes(engine);
  const columnSizes = readSheetColumnSizes(engine);
  if (!rowSizes || !columnSizes) return [];
  const config = core.configEngine.getDefaultConfig() as Partial<SheetConfig>;
  const context = { rowSizes, columnSizes, offsetX: config.sheetOffsetX ?? 50, offsetY: config.sheetOffsetY ?? 24 };
  const range = computeViewportRange(core.renderEngine.scrollManager, rowSizes, columnSizes);
  const merges = readSheetCellMerges(engine);
  const lines = new Map<string, { line: BorderLineSegment; stroke: SheetBorderStroke; priority: number }>();
  for (let row = range.startRow; row <= range.endRow; row += 1) {
    matrix.forEachStoredInRow(row, (border, column) => {
      if (!border || column < range.startCol || column > range.endCol) return;
      const rect = getSheetRangePositionRect([row, column], [row, column], context);
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      const merge = merges?.findRange(row, column);
      const start = merge?.getPoint(0);
      const end = merge?.getPoint(1);
      for (const side of Object.values(SheetBorderSide)) {
        const stroke = border[side];
        if (!stroke) continue;
        if (
          start &&
          end &&
          ((side === SheetBorderSide.Top && row !== start[0]) ||
            (side === SheetBorderSide.Bottom && row !== end[0]) ||
            (side === SheetBorderSide.Left && column !== start[1]) ||
            (side === SheetBorderSide.Right && column !== end[1]))
        )
          continue;
        const horizontal = side === SheetBorderSide.Top || side === SheetBorderSide.Bottom;
        const boundary = horizontal
          ? row + (side === SheetBorderSide.Bottom ? 1 : 0)
          : column + (side === SheetBorderSide.Right ? 1 : 0);
        const key = horizontal ? `h:${boundary}:${column}` : `v:${row}:${boundary}`;
        const priority = side === SheetBorderSide.Top || side === SheetBorderSide.Left ? 1 : 0;
        const previous = lines.get(key);
        // Concurrent edits on opposite sides resolve identically on every client.
        if (previous && previous.priority > priority) continue;
        const x = rect.x + (side === SheetBorderSide.Right ? rect.width : 0);
        const y = rect.y + (side === SheetBorderSide.Bottom ? rect.height : 0);
        lines.set(key, {
          priority,
          stroke,
          line: { x1: x, y1: y, x2: horizontal ? x + rect.width : x, y2: horizontal ? y : y + rect.height },
        });
      }
    });
  }
  return [...lines.values()].map(({ line, stroke }) => new CellBorderLineNode(line, stroke));
}
