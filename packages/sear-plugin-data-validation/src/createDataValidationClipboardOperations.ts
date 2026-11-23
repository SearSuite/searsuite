import {
  intersectSheetMoveRanges, subtractSheetMoveRange, type SheetClipboardCapturedInstance, type SheetMoveRange,
} from '@searsuite/sear-assembly-plugin';
import { createUpdateCellOTOperation } from '@searsuite/sear-domain-ot';
import { SearError } from '@searsuite/sear-foundation-error';
import { DataValidationMatrix } from './DataValidationMatrix';
import { assertDataValidationRule, type DataValidationRule } from './DataValidationRule';

interface CapturedRule {
  readonly start: readonly [number, number];
  readonly end: readonly [number, number];
  readonly rule: DataValidationRule;
}

/** Captures the selected portion of each rule, including partially selected range rules. */
export function captureDataValidationRules(matrix: DataValidationMatrix, source: SheetMoveRange): readonly CapturedRule[] {
  return matrix.getRules().flatMap(({ row, column, rule }) => {
    const clipped = intersectSheetMoveRanges(
      { start: [row, column], end: [rule.endRow, rule.endColumn] }, source,
    );
    return clipped ? [{
      start: [clipped.start[0] - source.start[0], clipped.start[1] - source.start[1]] as const,
      end: [clipped.end[0] - source.start[0], clipped.end[1] - source.start[1]] as const,
      rule,
    }] : [];
  });
}

/** Replaces rules within the pasted area while preserving fragments outside it. */
export function createDataValidationClipboardOperations(
  matrix: DataValidationMatrix, instances: readonly SheetClipboardCapturedInstance[],
  createId: () => string,
) {
  if (instances.some(({ portable }) => !Array.isArray(portable) || portable.some((entry) => !isCapturedRule(entry)))) {
    throw new SearError('Invalid data validation clipboard payload.');
  }
  const changes = new Map<string, { row: number; column: number; previous: DataValidationRule[] | null; next: DataValidationRule[] }>();
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
    const original = { start: [row, column] as const, end: [rule.endRow, rule.endColumn] as const };
    if (!instances.some(({ destination }) => intersectSheetMoveRanges(original, destination))) continue;
    const change = changeAt(row, column);
    change.next = change.next.filter((entry) => entry.id !== rule.id);
    const remainders = instances.reduce<SheetMoveRange[]>(
      (remaining, { destination }) => remaining.flatMap((part) => subtractSheetMoveRange(part, destination)),
      [original],
    );
    for (const remainder of remainders) {
      changeAt(remainder.start[0], remainder.start[1]).next.push({
        ...rule, id: createId(), endRow: remainder.end[0], endColumn: remainder.end[1],
      });
    }
  }
  instances.forEach(({ destination, portable }) => {
    for (const { start, end, rule } of portable as CapturedRule[]) {
      const row = destination.start[0] + start[0];
      const column = destination.start[1] + start[1];
      const next = {
        ...rule, id: createId(), endRow: destination.start[0] + end[0],
        endColumn: destination.start[1] + end[1],
      };
      if (next.endRow > destination.end[0] || next.endColumn > destination.end[1]) {
        throw new SearError('Data validation clipboard rule exceeds the paste range.');
      }
      assertDataValidationRule(next, row, column, matrix.shape);
      changeAt(row, column).next.push(next);
    }
  });
  return [...changes.values()].map(({ row, column, previous, next }) =>
    createUpdateCellOTOperation([row, column], next.length ? next : null, previous));
}

function isCapturedRule(value: unknown): value is CapturedRule {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<CapturedRule>;
  return Array.isArray(entry.start) && entry.start.length === 2 && entry.start.every(Number.isInteger) &&
    Array.isArray(entry.end) && entry.end.length === 2 && entry.end.every(Number.isInteger) &&
    entry.start[0] >= 0 && entry.start[1] >= 0 &&
    entry.end[0] >= entry.start[0] && entry.end[1] >= entry.start[1] &&
    !!entry.rule && typeof entry.rule.id === 'string' && !!entry.rule.condition;
}
