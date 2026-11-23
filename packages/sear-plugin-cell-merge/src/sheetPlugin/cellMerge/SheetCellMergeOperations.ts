import { SearError } from '@searsuite/sear-foundation-error';
import { type SheetRangeInput } from '@searsuite/sear-assembly-commands';
import { createUpdateCellOTOperation, type UpdateCellOTOperation } from '@searsuite/sear-domain-ot';
import { Rect } from '@searsuite/sear-foundation-rect';
import { type SheetCellMerge } from '../../CellMergeMatrix';
import {
  type SheetCellMergeActionDataSource,
  type SheetCellMergeCommandDataSource,
  type SheetMergeAnalysis,
  type SheetMergeDiscardedCell,
} from './SheetCellMergeCommandContracts';

export function analyzeMergeCells(
  input: SheetRangeInput,
  dataSource: SheetCellMergeActionDataSource,
): SheetMergeAnalysis | null {
  if (createMergeCellsOperations(input, dataSource).length === 0) return null;
  const { start, end } = normalizeSheetMergeRange(input, dataSource.readMatrix().shape);
  const occupiedCells: SheetMergeDiscardedCell[] = [];
  for (let row = start[0]; row <= end[0]; row++) {
    for (let column = start[1]; column <= end[1]; column++) {
      const value = dataSource.cellContent.readCell(row, column);
      if (value !== null && value !== undefined) occupiedCells.push({ row, column, value });
    }
  }
  return { start, end, retainedCell: occupiedCells[0] ?? null, discardedCells: occupiedCells.slice(1) };
}

export function createMergeCellsOperations(
  input: SheetRangeInput,
  dataSource: SheetCellMergeCommandDataSource,
): UpdateCellOTOperation<SheetCellMerge>[] {
  const matrix = dataSource.readMatrix();
  const target = normalizeSheetMergeRange(input, matrix.shape);
  if (sameSheetMergePoint(target.start, target.end)) return [];
  const exact = matrix.getItem(target.start[0], target.start[1]);
  if (exact?.endRow === target.end[0] && exact.endColumn === target.end[1]) return [];
  const overlaps = matrix.getRanges().some((range) => rangesOverlap(target, range));
  if (overlaps) throw new SearError('Sheet cell merge cannot overlap an existing merged range.');
  return [createUpdate(target.start, { endRow: target.end[0], endColumn: target.end[1] }, null)];
}

export function createUnmergeCellsOperations(
  input: SheetRangeInput,
  dataSource: SheetCellMergeCommandDataSource,
): UpdateCellOTOperation<SheetCellMerge>[] {
  const matrix = dataSource.readMatrix();
  const target = normalizeSheetMergeRange(input, matrix.shape);
  const existing = matrix.findRange(target.start[0], target.start[1]);
  if (!existing || !sameSheetMergeRange(target, existing)) return [];
  const anchor = existing.getPoint(0);
  const previous = matrix.getItem(anchor[0], anchor[1]);
  return previous === null ? [] : [createUpdate(anchor, null, previous)];
}

export function normalizeSheetMergeRange(
  input: SheetRangeInput,
  shape: readonly number[],
): { start: [number, number]; end: [number, number] } {
  const anchor = normalizePoint(input.anchor, 'range anchor');
  const focus = normalizePoint(input.focus, 'range focus');
  assertInBounds(anchor, shape, 'range anchor');
  assertInBounds(focus, shape, 'range focus');
  return {
    start: [Math.min(anchor[0], focus[0]), Math.min(anchor[1], focus[1])],
    end: [Math.max(anchor[0], focus[0]), Math.max(anchor[1], focus[1])],
  };
}

export function sameSheetMergePoint(left: readonly [number, number], right: readonly [number, number]): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

export function sameSheetMergeRange(
  target: { start: readonly [number, number]; end: readonly [number, number] },
  range: Rect,
): boolean {
  return sameSheetMergePoint(target.start, range.getPoint(0)) && sameSheetMergePoint(target.end, range.getPoint(1));
}

function createUpdate(
  point: readonly [number, number],
  value: SheetCellMerge | null,
  prev: SheetCellMerge | null,
): UpdateCellOTOperation<SheetCellMerge> {
  return createUpdateCellOTOperation([point[0], point[1]], value, prev);
}

function normalizePoint(point: readonly [number, number], label: string): [number, number] {
  if (!Array.isArray(point) || point.length !== 2 || !Number.isInteger(point[0]) || !Number.isInteger(point[1])) {
    throw new SearError(`${label} must be a [row, column] integer coordinate.`);
  }
  return [point[0], point[1]];
}

function assertInBounds(point: readonly [number, number], shape: readonly number[], label: string): void {
  if (point[0] < 0 || point[1] < 0 || point[0] >= (shape[0] ?? 0) || point[1] >= (shape[1] ?? 0)) {
    throw new SearError(`${label} is outside current sheet bounds.`);
  }
}

function rangesOverlap(
  target: { start: readonly [number, number]; end: readonly [number, number] },
  range: Rect,
): boolean {
  const start = range.getPoint(0);
  const end = range.getPoint(1);
  return !(
    target.end[0] < start[0] ||
    target.start[0] > end[0] ||
    target.end[1] < start[1] ||
    target.start[1] > end[1]
  );
}
