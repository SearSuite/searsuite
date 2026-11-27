import { SearError } from '@searsuite/sear-foundation-error';
import {
  createSheetTransaction,
  defineSheetCommand,
  SheetCommandBus,
  TransactionPipelineCommand,
} from '@searsuite/sear-assembly-commands';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { createResizeColOTOperation, createResizeRowOTOperation, type Operation } from '@searsuite/sear-domain-ot';

/** One explicit dimension change used by batch resize commands. */
export interface SheetDimensionResizeInput {
  readonly index: number;
  readonly size: number;
  readonly previousSize?: number;
}

/** Public input for resizing rows starting at `index` to a shared size. */
export interface SheetResizeRowsRangeInput {
  readonly index: number;
  readonly count?: number;
  readonly size: number;
}

/** Public input for resizing columns starting at `index` to a shared size. */
export interface SheetResizeColumnsRangeInput {
  readonly index: number;
  readonly count?: number;
  readonly size: number;
}

/** Public input for resizing arbitrary rows to explicit sizes. */
export interface SheetResizeRowsBatchInput {
  readonly sizes: readonly SheetDimensionResizeInput[];
}

/** Public input for resizing arbitrary columns to explicit sizes. */
export interface SheetResizeColumnsBatchInput {
  readonly sizes: readonly SheetDimensionResizeInput[];
}

/** Public input for resizing rows. */
export type SheetResizeRowsInput = SheetResizeRowsRangeInput | SheetResizeRowsBatchInput;

/** Public input for resizing columns. */
export type SheetResizeColumnsInput = SheetResizeColumnsRangeInput | SheetResizeColumnsBatchInput;

/** Public input for hiding rows starting at `index`. */
export interface SheetHideRowsInput {
  readonly index: number;
  readonly count?: number;
}

/** Public input for hiding columns starting at `index`. */
export interface SheetHideColumnsInput {
  readonly index: number;
  readonly count?: number;
}

/** Public input for unhiding rows starting at `index`. */
export interface SheetUnhideRowsInput {
  readonly index: number;
  readonly count?: number;
}

/** Public input for unhiding columns starting at `index`. */
export interface SheetUnhideColumnsInput {
  readonly index: number;
  readonly count?: number;
}

/** Resize-owned data required to create invertible row and column dimension operations. */
export interface SheetResizeDimensionCommandDataSource {
  /** Plugin key that owns row and column dimension state. */
  readonly target: PluginKey;
  /** Current row dimension count. */
  getRowCount(): number;
  /** Current column dimension count. */
  getColumnCount(): number;
  /** Default row height used when no sparse override is stored. */
  getDefaultRowSize(): number;
  /** Default column width used when no sparse override is stored. */
  getDefaultColumnSize(): number;
  /** Reads the current row height at `index`. */
  readRowSize(index: number): number;
  /** Reads the current column width at `index`. */
  readColumnSize(index: number): number;
  /** Reads the cached original size for a hidden row, if one exists. */
  readRowHiddenOriginalSize(index: number): number | null;
  /** Reads the cached original size for a hidden column, if one exists. */
  readColumnHiddenOriginalSize(index: number): number | null;
}

/** Resizes one or more row heights. */
export const ResizeSheetRowsCommand = defineSheetCommand<SheetResizeRowsInput>('sheet.resizeRows');
/** Resizes one or more column widths. */
export const ResizeSheetColumnsCommand = defineSheetCommand<SheetResizeColumnsInput>('sheet.resizeColumns');
/** Hides one or more rows by resizing them to zero. */
export const HideSheetRowsCommand = defineSheetCommand<SheetHideRowsInput>('sheet.hideRows');
/** Hides one or more columns by resizing them to zero. */
export const HideSheetColumnsCommand = defineSheetCommand<SheetHideColumnsInput>('sheet.hideColumns');
/** Restores one or more hidden rows from resize-owned hidden-size state. */
export const UnhideSheetRowsCommand = defineSheetCommand<SheetUnhideRowsInput>('sheet.unhideRows');
/** Restores one or more hidden columns from resize-owned hidden-size state. */
export const UnhideSheetColumnsCommand = defineSheetCommand<SheetUnhideColumnsInput>('sheet.unhideColumns');

/** Registers row and column dimension commands on one sheet command bus. */
export function registerSheetResizeDimensionCommands(
  commands: SheetCommandBus,
  dataSource: SheetResizeDimensionCommandDataSource,
): void {
  commands.register(ResizeSheetRowsCommand, function createResizeSheetRowsCommand(input) {
    return createResizePipelineCommand(
      ResizeSheetRowsCommand.id,
      dataSource,
      createResizeRowOperations(input, dataSource),
    );
  });
  commands.register(ResizeSheetColumnsCommand, function createResizeSheetColumnsCommand(input) {
    return createResizePipelineCommand(
      ResizeSheetColumnsCommand.id,
      dataSource,
      createResizeColumnOperations(input, dataSource),
    );
  });
  commands.register(HideSheetRowsCommand, function createHideSheetRowsCommand(input) {
    return createResizePipelineCommand(HideSheetRowsCommand.id, dataSource, createHideRowOperations(input, dataSource));
  });
  commands.register(HideSheetColumnsCommand, function createHideSheetColumnsCommand(input) {
    return createResizePipelineCommand(
      HideSheetColumnsCommand.id,
      dataSource,
      createHideColumnOperations(input, dataSource),
    );
  });
  commands.register(UnhideSheetRowsCommand, function createUnhideSheetRowsCommand(input) {
    return createResizePipelineCommand(
      UnhideSheetRowsCommand.id,
      dataSource,
      createUnhideRowOperations(input, dataSource),
    );
  });
  commands.register(UnhideSheetColumnsCommand, function createUnhideSheetColumnsCommand(input) {
    return createResizePipelineCommand(
      UnhideSheetColumnsCommand.id,
      dataSource,
      createUnhideColumnOperations(input, dataSource),
    );
  });
}

/** Creates row resize operations from public command input. */
export function createResizeRowOperations(
  input: SheetResizeRowsInput,
  dataSource: Pick<SheetResizeDimensionCommandDataSource, 'getRowCount' | 'readRowSize'>,
): Operation[] {
  if ('sizes' in input) {
    assertBatchNotEmpty(input.sizes, 'row resize');
    return input.sizes.map(function createResizeRowBatchOperation(entry) {
      const index = normalizeIndex(entry.index, 'row resize index');
      const size = normalizeSize(entry.size, 'row size');
      assertRangeWithinBounds(index, 1, dataSource.getRowCount(), 'row resize');
      return createResizeRowOperationWithValue(index, size, entry.previousSize ?? dataSource.readRowSize(index));
    });
  }
  const index = normalizeIndex(input.index, 'row resize index');
  const count = normalizeCount(input.count);
  const size = normalizeSize(input.size, 'row size');
  assertRangeWithinBounds(index, count, dataSource.getRowCount(), 'row resize');
  return createRangeOperations(index, count, function createResizeRowOperation(row) {
    return createResizeRowOperationWithValue(row, size, dataSource.readRowSize(row));
  });
}

/** Creates column resize operations from public command input. */
export function createResizeColumnOperations(
  input: SheetResizeColumnsInput,
  dataSource: Pick<SheetResizeDimensionCommandDataSource, 'getColumnCount' | 'readColumnSize'>,
): Operation[] {
  if ('sizes' in input) {
    assertBatchNotEmpty(input.sizes, 'column resize');
    return input.sizes.map(function createResizeColumnBatchOperation(entry) {
      const index = normalizeIndex(entry.index, 'column resize index');
      const size = normalizeSize(entry.size, 'column size');
      assertRangeWithinBounds(index, 1, dataSource.getColumnCount(), 'column resize');
      return createResizeColumnOperationWithValue(index, size, entry.previousSize ?? dataSource.readColumnSize(index));
    });
  }
  const index = normalizeIndex(input.index, 'column resize index');
  const count = normalizeCount(input.count);
  const size = normalizeSize(input.size, 'column size');
  assertRangeWithinBounds(index, count, dataSource.getColumnCount(), 'column resize');
  return createRangeOperations(index, count, function createResizeColumnOperation(column) {
    return createResizeColumnOperationWithValue(column, size, dataSource.readColumnSize(column));
  });
}

/** Creates row hide operations from public command input. */
export function createHideRowOperations(
  input: SheetHideRowsInput,
  dataSource: Pick<SheetResizeDimensionCommandDataSource, 'getRowCount' | 'readRowSize'>,
): Operation[] {
  const index = normalizeIndex(input.index, 'row hide index');
  const count = normalizeCount(input.count);
  assertRangeWithinBounds(index, count, dataSource.getRowCount(), 'row hide');
  return createRangeOperations(index, count, function createHideRowOperation(row) {
    return createResizeRowOperationWithValue(row, 0, dataSource.readRowSize(row));
  });
}

/** Creates column hide operations from public command input. */
export function createHideColumnOperations(
  input: SheetHideColumnsInput,
  dataSource: Pick<SheetResizeDimensionCommandDataSource, 'getColumnCount' | 'readColumnSize'>,
): Operation[] {
  const index = normalizeIndex(input.index, 'column hide index');
  const count = normalizeCount(input.count);
  assertRangeWithinBounds(index, count, dataSource.getColumnCount(), 'column hide');
  return createRangeOperations(index, count, function createHideColumnOperation(column) {
    return createResizeColumnOperationWithValue(column, 0, dataSource.readColumnSize(column));
  });
}

/** Creates row unhide operations from public command input. */
export function createUnhideRowOperations(
  input: SheetUnhideRowsInput,
  dataSource: Pick<
    SheetResizeDimensionCommandDataSource,
    'getRowCount' | 'getDefaultRowSize' | 'readRowHiddenOriginalSize' | 'readRowSize'
  >,
): Operation[] {
  const index = normalizeIndex(input.index, 'row unhide index');
  const count = normalizeCount(input.count);
  assertRangeWithinBounds(index, count, dataSource.getRowCount(), 'row unhide');
  return createRangeOperations(index, count, function createUnhideRowOperation(row) {
    if (dataSource.readRowSize(row) !== 0) return null;
    const restore = dataSource.readRowHiddenOriginalSize(row) ?? dataSource.getDefaultRowSize();
    return createResizeRowOperationWithValue(row, restore, 0);
  });
}

/** Creates column unhide operations from public command input. */
export function createUnhideColumnOperations(
  input: SheetUnhideColumnsInput,
  dataSource: Pick<
    SheetResizeDimensionCommandDataSource,
    'getColumnCount' | 'getDefaultColumnSize' | 'readColumnHiddenOriginalSize' | 'readColumnSize'
  >,
): Operation[] {
  const index = normalizeIndex(input.index, 'column unhide index');
  const count = normalizeCount(input.count);
  assertRangeWithinBounds(index, count, dataSource.getColumnCount(), 'column unhide');
  return createRangeOperations(index, count, function createUnhideColumnOperation(column) {
    if (dataSource.readColumnSize(column) !== 0) return null;
    const restore = dataSource.readColumnHiddenOriginalSize(column) ?? dataSource.getDefaultColumnSize();
    return createResizeColumnOperationWithValue(column, restore, 0);
  });
}

function createResizePipelineCommand(
  id: string,
  dataSource: SheetResizeDimensionCommandDataSource,
  operations: Operation[],
): TransactionPipelineCommand {
  return new TransactionPipelineCommand(id, createSheetTransaction(dataSource.target, operations));
}

function createRangeOperations(
  index: number,
  count: number,
  createOperation: (index: number) => Operation | null,
): Operation[] {
  const operations: Operation[] = [];
  for (let offset = 0; offset < count; offset++) {
    const operation = createOperation(index + offset);
    if (operation) operations.push(operation);
  }
  return operations;
}

function createResizeRowOperationWithValue(index: number, value: number, prev: number): Operation {
  return createResizeRowOTOperation([index], value, prev);
}

function createResizeColumnOperationWithValue(index: number, value: number, prev: number): Operation {
  return createResizeColOTOperation([index], value, prev);
}

function normalizeIndex(index: number, label: string): number {
  if (!Number.isInteger(index) || index < 0) throw new SearError(`${label} must be a non-negative integer.`);
  return index;
}

function normalizeCount(count: number | undefined): number {
  const value = count ?? 1;
  if (!Number.isInteger(value) || value <= 0)
    throw new SearError('sheet resize command count must be a positive integer.');
  return value;
}

function normalizeSize(size: number, label: string): number {
  if (!Number.isFinite(size) || size < 0) throw new SearError(`${label} must be a non-negative finite number.`);
  return size;
}

function assertRangeWithinBounds(index: number, count: number, size: number, label: string): void {
  if (index + count > size) throw new SearError(`${label} range exceeds current sheet bounds.`);
}

function assertBatchNotEmpty(batch: readonly SheetDimensionResizeInput[], label: string): void {
  if (batch.length === 0) throw new SearError(`${label} batch must contain at least one size.`);
}
