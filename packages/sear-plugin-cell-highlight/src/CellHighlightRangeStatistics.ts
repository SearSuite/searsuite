import { CellHighlightKind, type CellHighlightCondition } from './CellHighlightRule';

export type CellHighlightNumericRangeReader = (
  startRow: number, startColumn: number, endRow: number, endColumn: number,
  visit: (value: number) => void,
) => void;

/** Computes one threshold per rule; ranking includes all cells tied at the boundary. */
export function computeCellHighlightRangeThreshold(
  condition: CellHighlightCondition,
  startRow: number, startColumn: number, endRow: number, endColumn: number,
  forEachNumericValueInRange: CellHighlightNumericRangeReader,
): number | null {
  let total = 0;
  forEachNumericValueInRange(startRow, startColumn, endRow, endColumn, (value) => {
    if (!Number.isFinite(value)) return;
    total += 1;
  });
  if (total === 0) return null;
  if (condition.kind === CellHighlightKind.AboveAverage || condition.kind === CellHighlightKind.BelowAverage) {
    let average = 0;
    forEachNumericValueInRange(startRow, startColumn, endRow, endColumn, (value) => {
      if (Number.isFinite(value)) average += value / total;
    });
    return average;
  }

  const top = condition.kind === CellHighlightKind.Top;
  const count = condition.percent ? Math.ceil(total * (condition.count ?? 0) / 100) : condition.count ?? 0;
  if (count >= total) return top ? -Infinity : Infinity;
  const heap: number[] = [];
  const lessExtreme = (a: number, b: number) => top ? a < b : a > b;
  forEachNumericValueInRange(startRow, startColumn, endRow, endColumn, (value) => {
    if (!Number.isFinite(value)) return;
    if (heap.length < count) {
      let index = heap.push(value) - 1;
      while (index > 0) {
        const parent = Math.floor((index - 1) / 2);
        if (!lessExtreme(heap[index], heap[parent])) break;
        [heap[index], heap[parent]] = [heap[parent], heap[index]];
        index = parent;
      }
    } else if (lessExtreme(heap[0], value)) {
      heap[0] = value;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        if (left >= heap.length) break;
        const right = left + 1;
        const child = right < heap.length && lessExtreme(heap[right], heap[left]) ? right : left;
        if (!lessExtreme(heap[child], heap[index])) break;
        [heap[index], heap[child]] = [heap[child], heap[index]];
        index = child;
      }
    }
  });
  return heap[0] ?? null;
}
