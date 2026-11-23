import { SearError } from '@searsuite/sear-foundation-error';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { createUpdateCellOTOperation, type UpdateCellOTOperation } from '@searsuite/sear-domain-ot';

import { SheetCommandBus } from '../SheetCommandBus';
import { TransactionPipelineCommand, createSheetTransaction } from '../TransactionCommand';
import { ClearRangeContentsCommand } from './ClearRangeContentsCommand';

/** A zero-based sheet cell coordinate expressed as `[row, column]`. */
export type SheetCellPoint = readonly [number, number];

/** Normalized rectangular sheet range bounds expressed as inclusive cell coordinates. */
export interface SheetRangeBounds {
  /** Inclusive top-left cell coordinate. */
  readonly start: SheetCellPoint;
  /** Inclusive bottom-right cell coordinate. */
  readonly end: SheetCellPoint;
}

/** Common range input accepted by explicit range commands. */
export interface SheetRangeInput {
  /** One corner of the target range. */
  readonly anchor: SheetCellPoint;
  /** Opposite corner of the target range. */
  readonly focus: SheetCellPoint;
}

/** Public input for clearing persisted contents in a range. */
export interface SheetClearRangeContentsInput extends SheetRangeInput {}

/** Sheet cell data required to create clear-contents operations. */
export interface SheetClearRangeContentsCommandDataSource<Cell = unknown> {
  /** Plugin key that owns the persisted sheet data matrix. */
  readonly target: PluginKey;
  /** Current row count. */
  getRowCount(): number;
  /** Current column count. */
  getColumnCount(): number;
  /** Reads the current cell value at `row`, `column`. */
  readCell(row: number, column: number): Cell | null;
  /** Optionally excludes cells from this clear operation. */
  includeCell?(row: number, column: number): boolean;
  /** Optional protection check before clearing an occupied cell. */
  validateClearCell?(row: number, column: number): { readonly reject: boolean; readonly message?: string };
}

/** Data source for the built-in clear-contents command. */
export type SheetRangeCommandDataSource<Cell = unknown> = SheetClearRangeContentsCommandDataSource<Cell>;

/** Registers the built-in range commands on one sheet command bus. */
export function registerSheetRangeCommands(commands: SheetCommandBus, dataSource: SheetRangeCommandDataSource): void {
  commands.register(ClearRangeContentsCommand, function createClearRangeContentsCommand(input) {
    return new TransactionPipelineCommand(
      ClearRangeContentsCommand.id,
      createSheetTransaction(dataSource.target, createClearRangeContentsOperations(input, dataSource)),
    );
  });
}

/** Creates UpdateCell operations that clear non-empty cells inside a range. */
export function createClearRangeContentsOperations<Cell>(
  input: SheetClearRangeContentsInput,
  dataSource: SheetClearRangeContentsCommandDataSource<Cell>,
): UpdateCellOTOperation<Cell>[] {
  const range = normalizeRange(input, dataSource);
  if (!range) return [];
  const operations: UpdateCellOTOperation<Cell>[] = [];
  forEachCell(range, function createClearCellOperation(row, column) {
    if (dataSource.includeCell?.(row, column) === false) return;
    const prev = dataSource.readCell(row, column);
    if (prev == null) return;
    const validation = dataSource.validateClearCell?.(row, column);
    if (validation?.reject) throw new SearError(validation.message ?? 'Cell contents cannot be cleared.');
    operations.push(createUpdateCellOTOperation([row, column], null, prev));
  });
  return operations;
}

function normalizeRange(
  input: SheetRangeInput,
  dataSource: Pick<SheetClearRangeContentsCommandDataSource, 'getRowCount' | 'getColumnCount'>,
): SheetRangeBounds | null {
  const anchor = normalizePoint(input.anchor, 'range anchor');
  const focus = normalizePoint(input.focus, 'range focus');
  if (focus[0] === -1) return null;
  assertPointInBounds(anchor, dataSource, 'range anchor');
  assertPointInBounds(focus, dataSource, 'range focus');
  return {
    start: [Math.min(anchor[0], focus[0]), Math.min(anchor[1], focus[1])],
    end: [Math.max(anchor[0], focus[0]), Math.max(anchor[1], focus[1])],
  };
}

function normalizePoint(point: SheetCellPoint, label: string): SheetCellPoint {
  if (!Array.isArray(point) || point.length !== 2) throw new SearError(`${label} must be a [row, column] coordinate.`);
  const [row, column] = point;
  if (!Number.isInteger(row) || !Number.isInteger(column)) {
    throw new SearError(`${label} must contain integer coordinates.`);
  }
  return [row, column];
}

function assertPointInBounds(
  point: SheetCellPoint,
  dataSource: Pick<SheetClearRangeContentsCommandDataSource, 'getRowCount' | 'getColumnCount'>,
  label: string,
): void {
  const [row, column] = point;
  if (row < 0 || column < 0 || row >= dataSource.getRowCount() || column >= dataSource.getColumnCount()) {
    throw new SearError(`${label} is outside current sheet bounds.`);
  }
}

function forEachCell(range: SheetRangeBounds, callback: (row: number, column: number) => void): void {
  for (let row = range.start[0]; row <= range.end[0]; row++) {
    for (let column = range.start[1]; column <= range.end[1]; column++) {
      callback(row, column);
    }
  }
}
