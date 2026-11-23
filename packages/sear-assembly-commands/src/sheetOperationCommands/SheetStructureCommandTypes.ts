import { SearError } from '@searsuite/sear-foundation-error';
import { PluginKey, type SheetStructureMoveRegistry } from '@searsuite/sear-assembly-plugin';
import {
  createDeleteColOTOperation,
  createDeleteRowOTOperation,
  createInsertColOTOperation,
  createInsertRowOTOperation,
  type DeleteColOTOperation,
  type DeleteRowOTOperation,
  type InsertColOTOperation,
  type InsertRowOTOperation,
} from '@searsuite/sear-domain-ot';

import { SheetCommandBus } from '../SheetCommandBus';
import { type SheetCommandResult } from '../SheetCommand';
import { TransactionPipelineCommand, createSheetTransaction } from '../TransactionCommand';
import { DeleteColumnCommand } from './DeleteColumnCommand';
import { DeleteRowCommand } from './DeleteRowCommand';
import { InsertColumnCommand } from './InsertColumnCommand';
import { InsertRowCommand } from './InsertRowCommand';
import { MoveRowsCommand } from './MoveRowsCommand';
import { MoveColumnsCommand } from './MoveColumnsCommand';
import { createMoveRowsOperations, createMoveColumnsOperations } from './createAxisReorderOperations';

/** Public input for inserting rows before `index`. */
export interface SheetInsertRowsInput {
  readonly index: number;
  readonly count?: number;
  readonly historyGroup?: SheetCommandResult['historyGroup'];
}

/** Public input for inserting columns before `index`. */
export interface SheetInsertColumnsInput {
  readonly index: number;
  readonly count?: number;
  readonly historyGroup?: SheetCommandResult['historyGroup'];
}

/** Public input for deleting rows starting at `index`. */
export interface SheetDeleteRowsInput {
  readonly index: number;
  readonly count?: number;
}

/** Public input for deleting columns starting at `index`. */
export interface SheetDeleteColumnsInput {
  readonly index: number;
  readonly count?: number;
}

/** Sheet matrix access used by structure commands without depending on a concrete data package. */
export interface SheetStructureCommandDataSource<Cell = unknown> {
  /** Plugin key that owns the persisted sheet data matrix. */
  readonly target: PluginKey;
  /** Current row count. */
  getRowCount(): number;
  /** Current column count. */
  getColumnCount(): number;
  /** Reads a dense row payload for invertible row deletion. */
  readRow(index: number): Array<Cell | null>;
  /** Reads a dense column payload for invertible column deletion. */
  readColumn(index: number): Array<Cell | null>;
}

/** Registers the default sheet row/column structure commands. */
export function registerSheetStructureCommands(
  commands: SheetCommandBus,
  dataSource: SheetStructureCommandDataSource,
  moves?: SheetStructureMoveRegistry,
): void {
  const plan = (operations: Parameters<SheetStructureMoveRegistry['plan']>[0]['operations']) =>
    moves?.plan({ target: dataSource.target, operations }) ?? operations;
  commands.register(
    MoveRowsCommand,
    (input) =>
      new TransactionPipelineCommand(
        MoveRowsCommand.id,
        createSheetTransaction(dataSource.target, plan(createMoveRowsOperations(input, dataSource.getRowCount()))),
      ),
  );
  commands.register(
    MoveColumnsCommand,
    (input) =>
      new TransactionPipelineCommand(
        MoveColumnsCommand.id,
        createSheetTransaction(
          dataSource.target,
          plan(createMoveColumnsOperations(input, dataSource.getColumnCount())),
        ),
      ),
  );
  commands.register(InsertRowCommand, function createInsertRowsCommand(input) {
    return new TransactionPipelineCommand(
      InsertRowCommand.id,
      createSheetTransaction(dataSource.target, plan(createInsertRowOperations(input, dataSource))),
      input.historyGroup,
    );
  });
  commands.register(InsertColumnCommand, function createInsertColumnsCommand(input) {
    return new TransactionPipelineCommand(
      InsertColumnCommand.id,
      createSheetTransaction(dataSource.target, plan(createInsertColumnOperations(input, dataSource))),
      input.historyGroup,
    );
  });
  commands.register(DeleteRowCommand, function createDeleteRowsCommand(input) {
    return new TransactionPipelineCommand(
      DeleteRowCommand.id,
      createSheetTransaction(dataSource.target, plan(createDeleteRowOperations(input, dataSource))),
    );
  });
  commands.register(DeleteColumnCommand, function createDeleteColumnsCommand(input) {
    return new TransactionPipelineCommand(
      DeleteColumnCommand.id,
      createSheetTransaction(dataSource.target, plan(createDeleteColumnOperations(input, dataSource))),
    );
  });
}

/** Creates RowInsert operations from public command input. */
export function createInsertRowOperations(
  input: SheetInsertRowsInput,
  dataSource: Pick<SheetStructureCommandDataSource, 'getColumnCount'>,
): InsertRowOTOperation<unknown>[] {
  const index = normalizeIndex(input.index, 'row insert index');
  const count = normalizeCount(input.count);
  const columnCount = dataSource.getColumnCount();
  return Array.from({ length: count }, () => createInsertRowOTOperation([index], Array(columnCount).fill(null)));
}

/** Creates ColInsert operations from public command input. */
export function createInsertColumnOperations(
  input: SheetInsertColumnsInput,
  dataSource: Pick<SheetStructureCommandDataSource, 'getRowCount'>,
): InsertColOTOperation<unknown>[] {
  const index = normalizeIndex(input.index, 'column insert index');
  const count = normalizeCount(input.count);
  const rowCount = dataSource.getRowCount();
  return Array.from({ length: count }, () => createInsertColOTOperation([index], Array(rowCount).fill(null)));
}

/** Creates RowDelete operations from public command input, ordered from bottom to top. */
export function createDeleteRowOperations(
  input: SheetDeleteRowsInput,
  dataSource: Pick<SheetStructureCommandDataSource, 'getRowCount' | 'readRow'>,
): DeleteRowOTOperation<unknown>[] {
  const index = normalizeIndex(input.index, 'row delete index');
  const count = normalizeCount(input.count);
  assertRangeWithinBounds(index, count, dataSource.getRowCount(), 'row delete');
  const operations: DeleteRowOTOperation<unknown>[] = [];
  for (let row = index + count - 1; row >= index; row--) {
    operations.push(createDeleteRowOTOperation([row], dataSource.readRow(row)));
  }
  return operations;
}

/** Creates ColDelete operations from public command input, ordered from right to left. */
export function createDeleteColumnOperations(
  input: SheetDeleteColumnsInput,
  dataSource: Pick<SheetStructureCommandDataSource, 'getColumnCount' | 'readColumn'>,
): DeleteColOTOperation<unknown>[] {
  const index = normalizeIndex(input.index, 'column delete index');
  const count = normalizeCount(input.count);
  assertRangeWithinBounds(index, count, dataSource.getColumnCount(), 'column delete');
  const operations: DeleteColOTOperation<unknown>[] = [];
  for (let column = index + count - 1; column >= index; column--) {
    operations.push(createDeleteColOTOperation([column], dataSource.readColumn(column)));
  }
  return operations;
}

function normalizeIndex(index: number, label: string): number {
  if (!Number.isInteger(index) || index < 0) throw new SearError(`${label} must be a non-negative integer.`);
  return index;
}

function normalizeCount(count: number | undefined): number {
  const value = count ?? 1;
  if (!Number.isInteger(value) || value <= 0)
    throw new SearError('sheet structure command count must be a positive integer.');
  return value;
}

function assertRangeWithinBounds(index: number, count: number, size: number, label: string): void {
  if (index + count > size) throw new SearError(`${label} range exceeds current sheet bounds.`);
}
