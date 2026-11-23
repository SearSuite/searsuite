import { type SheetMoveRange } from './SheetRangeMoveContribution';

/** Returns the shared inclusive area of two ranges, if any. */
export function intersectSheetMoveRanges(left: SheetMoveRange, right: SheetMoveRange): SheetMoveRange | null {
  const top = Math.max(left.start[0], right.start[0]);
  const column = Math.max(left.start[1], right.start[1]);
  const bottom = Math.min(left.end[0], right.end[0]);
  const endColumn = Math.min(left.end[1], right.end[1]);
  return top <= bottom && column <= endColumn
    ? { start: [top, column], end: [bottom, endColumn] }
    : null;
}

/** Removes one inclusive rectangle, retaining at most four disjoint pieces. */
export function subtractSheetMoveRange(original: SheetMoveRange, cut: SheetMoveRange): SheetMoveRange[] {
  const overlap = intersectSheetMoveRanges(original, cut);
  if (!overlap) return [original];
  const result: SheetMoveRange[] = [];
  const [top, left] = original.start;
  const [bottom, right] = original.end;
  const [cutTop, cutLeft] = overlap.start;
  const [cutBottom, cutRight] = overlap.end;
  if (top < cutTop) result.push({ start: [top, left], end: [cutTop - 1, right] });
  if (cutBottom < bottom) result.push({ start: [cutBottom + 1, left], end: [bottom, right] });
  if (left < cutLeft) result.push({ start: [cutTop, left], end: [cutBottom, cutLeft - 1] });
  if (cutRight < right) result.push({ start: [cutTop, cutRight + 1], end: [cutBottom, right] });
  return result;
}

/** Translates a rule fragment by the source-to-destination displacement. */
export function translateSheetMoveRange(range: SheetMoveRange, source: SheetMoveRange, destination: SheetMoveRange): SheetMoveRange {
  const rowDelta = destination.start[0] - source.start[0];
  const columnDelta = destination.start[1] - source.start[1];
  return {
    start: [range.start[0] + rowDelta, range.start[1] + columnDelta],
    end: [range.end[0] + rowDelta, range.end[1] + columnDelta],
  };
}
