import {
  intersectSheetMoveRanges,
  subtractSheetMoveRange,
  type SheetMoveRange,
  type SheetRangeReorderContext,
} from '@searsuite/sear-assembly-plugin';
import { createUpdateCellOTOperation, MatrixCellUpdateIntent } from '@searsuite/sear-domain-ot';
import { DataValidationMatrix } from './DataValidationMatrix';
import { type DataValidationRule } from './DataValidationRule';

/** Keeps rule coverage attached to the values moved by a row sort. */
export function createDataValidationReorderOperations(
  matrix: DataValidationMatrix,
  context: SheetRangeReorderContext,
  createId: () => string,
) {
  const changes = new Map<string, {
    row: number; column: number; previous: DataValidationRule[] | null; next: DataValidationRule[];
  }>();
  const changeAt = (row: number, column: number) => {
    const key = `${row}:${column}`;
    let change = changes.get(key);
    if (!change) {
      const previous = matrix.getItem(row, column);
      change = { row, column, previous, next: [...(previous ?? [])] };
      changes.set(key, change);
    }
    return change;
  };
  for (const { row, column, rule } of matrix.getRules()) {
    const original: SheetMoveRange = {
      start: [row, column], end: [rule.endRow, rule.endColumn],
    };
    const intersection = intersectSheetMoveRanges(original, context.range);
    if (!intersection) continue;
    const moved = reorderedRuleRanges(intersection, context);
    if (moved.length === 1 && sameRange(moved[0]!, intersection)) continue;
    changeAt(row, column).next = changeAt(row, column).next.filter((entry) => entry.id !== rule.id);
    const fragments = [...subtractSheetMoveRange(original, context.range), ...moved];
    fragments.forEach((range, index) => {
      changeAt(range.start[0], range.start[1]).next.push({
        ...rule,
        id: index === 0 ? rule.id : createId(),
        endRow: range.end[0],
        endColumn: range.end[1],
      });
    });
  }
  return [...changes.values()].map(({ row, column, previous, next }) =>
    createUpdateCellOTOperation([row, column], next.length ? next : null, previous, MatrixCellUpdateIntent.Relocation));
}

function reorderedRuleRanges(intersection: SheetMoveRange, context: SheetRangeReorderContext): SheetMoveRange[] {
  if (intersection.start[0] === context.range.start[0] && intersection.end[0] === context.range.end[0]) {
    return [intersection];
  }
  const rows: number[] = [];
  for (let row = intersection.start[0]; row <= intersection.end[0]; row += 1) rows.push(context.destinationOf(row));
  rows.sort((left, right) => left - right);
  const ranges: SheetMoveRange[] = [];
  let start = rows[0]!;
  let end = start;
  for (const row of rows.slice(1)) {
    if (row === end + 1) end = row;
    else {
      ranges.push({ start: [start, intersection.start[1]], end: [end, intersection.end[1]] });
      start = end = row;
    }
  }
  ranges.push({ start: [start, intersection.start[1]], end: [end, intersection.end[1]] });
  return ranges;
}

function sameRange(left: SheetMoveRange, right: SheetMoveRange): boolean {
  return left.start[0] === right.start[0] && left.start[1] === right.start[1] &&
    left.end[0] === right.end[0] && left.end[1] === right.end[1];
}
