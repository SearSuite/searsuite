import { type SheetAxisDragDestination, SheetDragAxis } from '@searsuite/sear-plugin-selection';
import { SheetHighlightEdge, type SheetRangeHighlight } from '../highlight/SheetHighlightRegistry';

export function createAxisDragHighlight(
  { axis, before }: SheetAxisDragDestination,
  rows: number,
  columns: number,
): SheetRangeHighlight {
  const size = axis === SheetDragAxis.Row ? rows : columns;
  const position = Math.min(size - 1, before);
  return {
    start: axis === SheetDragAxis.Row ? [position, 0] : [0, position],
    end: axis === SheetDragAxis.Row ? [position, columns - 1] : [rows - 1, position],
    type: 'sheet-axis-move-guide',
    depth: 4,
    skipHit: true,
    edge:
      axis === SheetDragAxis.Row
        ? before === size
          ? SheetHighlightEdge.Bottom
          : SheetHighlightEdge.Top
        : before === size
        ? SheetHighlightEdge.Right
        : SheetHighlightEdge.Left,
  };
}
