import { MoveRowsCommand, MoveColumnsCommand, type SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { type SheetMoveRange } from '@searsuite/sear-assembly-plugin';
import { SheetHighlightEdge, type SheetRangeHighlight } from './SheetHighlightRegistry';
import { SheetDragAxis } from './SheetDragAxis';
import { SelectRangeCommand } from './SheetSelectionCommands';

/** Original block and insertion edge of one complete-axis gesture. */
export interface SheetAxisDragDestination {
  readonly source: SheetMoveRange;
  readonly axis: SheetDragAxis;
  readonly before: number;
}

/** Anchors the insertion guide to an edge on the destination axis. */
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

/** Commits document reordering before updating the local selection to the moved block. */
export function commitAxisDrag(commands: SheetCommandBus, { source, axis, before }: SheetAxisDragDestination): void {
  const index = source.start[axis];
  const count = source.end[axis] - index + 1;
  if (before >= index && before <= index + count) return;
  commands.run(axis === SheetDragAxis.Row ? MoveRowsCommand : MoveColumnsCommand, { index, count, before });
  const destination = before > index ? before - count : before;
  const anchor: [number, number] = [...source.start];
  const focus: [number, number] = [...source.end];
  anchor[axis] = destination;
  focus[axis] = destination + count - 1;
  commands.run(SelectRangeCommand, { anchor, focus });
}
