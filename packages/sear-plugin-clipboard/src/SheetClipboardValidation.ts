import { SheetClipboardError, SheetClipboardErrorCode } from './SheetClipboardErrors';
import type { SheetClipboardDataSource, SheetClipboardDecodedRow, SheetClipboardMergedRange } from './SheetClipboardContracts';

/** Rejects malformed or overlapping merge geometry from an external structured payload. */
export function assertClipboardMergedRanges(
  merges: readonly SheetClipboardMergedRange[],
  rows: readonly SheetClipboardDecodedRow[],
): void {
  const height = rows.length;
  const width = Math.max(0, ...rows.map((row) => row.length));
  merges.forEach((merge, index) => {
    const { start, end } = merge;
    if (
      !Array.isArray(start) || !Array.isArray(end) || start.length !== 2 || end.length !== 2 ||
      !start.every(Number.isInteger) || !end.every(Number.isInteger) ||
      start[0] < 0 || start[1] < 0 || end[0] >= height || end[1] >= width ||
      end[0] < start[0] || end[1] < start[1] ||
      (end[0] === start[0] && end[1] === start[1]) ||
      merges.slice(0, index).some((other) => rangesOverlap(merge, other))
    ) {
      throw new SheetClipboardError(SheetClipboardErrorCode.InvalidPayload, 'Clipboard payload contains invalid merged ranges.');
    }
  });
}

export function assertPasteBounds(target: [number, number], rows: readonly SheetClipboardDecodedRow[], source: SheetClipboardDataSource): void {
  const rowCount = rows.length;
  const columnCount = Math.max(0, ...rows.map((row) => row.length));
  if (rowCount === 0 || columnCount === 0) throw new SheetClipboardError(SheetClipboardErrorCode.InvalidPayload, 'Clipboard payload contains no cells.');
  const end: [number, number] = [target[0] + rowCount - 1, target[1] + columnCount - 1];
  if (end[0] >= source.getRowCount() || end[1] >= source.getColumnCount()) {
    throw new SheetClipboardError(SheetClipboardErrorCode.TargetOutOfBounds, 'Clipboard paste target exceeds sheet bounds.', {
      target, rowCount, columnCount, rowLimit: source.getRowCount(), columnLimit: source.getColumnCount(),
    });
  }
}

/** Prevents clipboard values from being silently stored under a merged-cell anchor. */
export function assertPasteMergeTarget(
  target: [number, number],
  rows: readonly SheetClipboardDecodedRow[],
  source: SheetClipboardDataSource,
  merges: readonly SheetClipboardMergedRange[] = [],
): void {
  if (!source.getMergedRange) return;
  rows.forEach((row, rowOffset) => row.forEach((_cell, columnOffset) => {
    const cellRow = target[0] + rowOffset;
    const cellColumn = target[1] + columnOffset;
    const merged = source.getMergedRange!(cellRow, cellColumn);
    const matchesPayload = merged && merges.some((merge) =>
      target[0] + merge.start[0] === merged.start[0] &&
      target[1] + merge.start[1] === merged.start[1] &&
      target[0] + merge.end[0] === merged.end[0] &&
      target[1] + merge.end[1] === merged.end[1],
    );
    if (merged && !matchesPayload && (merged.start[0] !== cellRow || merged.start[1] !== cellColumn)) {
      throw new SheetClipboardError(
        SheetClipboardErrorCode.TargetIntersectsMergedCells,
        'Paste would write into a hidden merged cell.',
        { target, cell: [cellRow, cellColumn], merged },
      );
    }
  }));
}

function rangesOverlap(left: SheetClipboardMergedRange, right: SheetClipboardMergedRange): boolean {
  return left.start[0] <= right.end[0] && left.end[0] >= right.start[0] &&
    left.start[1] <= right.end[1] && left.end[1] >= right.start[1];
}
