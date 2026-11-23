import { type Rect } from '@searsuite/sear-foundation-rect';
import { MatrixOTActionName, type MoveRowOTOperation, type MoveColOTOperation } from '@searsuite/sear-domain-ot';
import { SheetMergeStructureMoveError } from './SheetMergeStructureMoveError';

/** Projects the final permutation, not its transient, potentially split intermediate ranges. */
export function transformMergedRangesByMoves(
  ranges: Rect[],
  operations: readonly (MoveRowOTOperation<unknown> | MoveColOTOperation<unknown>)[],
): void {
  for (const range of ranges) {
    const start = range.getPoint(0);
    const end = range.getPoint(1);
    for (const axis of [0, 1] as const) {
      let intervals: [number, number][] = [[start[axis], end[axis]]];
      for (const operation of operations) {
        const destination =
          axis === 0
            ? MatrixOTActionName.RowMove in operation
              ? operation.rm[0]
              : undefined
            : MatrixOTActionName.ColMove in operation
            ? operation.cm[0]
            : undefined;
        if (destination === undefined) continue;
        const source = operation.p[0];
        const hasSource = intervals.some(([a, b]) => a <= source && source <= b);
        const hasDestination = intervals.some(([a, b]) => a <= destination && destination <= b);
        if (hasSource === hasDestination) continue;
        const removed = hasSource ? source : destination;
        const added = hasSource ? destination : source;
        intervals = intervals.flatMap(([a, b]): [number, number][] => {
          if (removed < a || removed > b) return [[a, b]];
          return [
            ...(a < removed ? [[a, removed - 1] as [number, number]] : []),
            ...(removed < b ? [[removed + 1, b] as [number, number]] : []),
          ];
        });
        intervals.push([added, added]);
        intervals.sort(([a], [b]) => a - b);
        const joined: [number, number][] = [];
        for (const interval of intervals) {
          const previous = joined[joined.length - 1];
          if (previous && previous[1] + 1 === interval[0]) previous[1] = interval[1];
          else joined.push(interval);
        }
        intervals = joined;
      }
      if (intervals.length !== 1) throw new SheetMergeStructureMoveError(range.shape);
      start[axis] = intervals[0][0];
      end[axis] = intervals[0][1];
    }
  }
}
