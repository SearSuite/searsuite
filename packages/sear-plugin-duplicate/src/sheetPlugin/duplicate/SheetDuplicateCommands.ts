import {
  createSheetTransaction,
  defineSheetCommand,
  SheetCommandBus,
  TransactionPipelineCommand,
  type SheetRangeInput,
} from '@searsuite/sear-assembly-commands';
import { type PluginKey } from '@searsuite/sear-assembly-plugin';
import { type CellMatrixElement } from '@searsuite/sear-domain-cell-types';
import {
  createDeleteRowOTOperation,
  createUpdateCellOTOperation,
  type DeleteRowOTOperation,
  type UpdateCellOTOperation,
} from '@searsuite/sear-domain-ot';
import { SearError } from '@searsuite/sear-foundation-error';
import { assertSheetDuplicateHighlight, type SheetDuplicateHighlight } from '../../DuplicateMatrix';
import { forEachDuplicateCell, normalizeDuplicateRange, type DuplicateRangeDataSource } from './DuplicateRange';

/** Public command for highlighting duplicate cell values in a range. */
export const HighlightDuplicateRowsCommand =
  defineSheetCommand<SheetDuplicateHighlightInput>('range.highlightDuplicates');

/** Public command for clearing duplicate highlights in a range. */
export const ClearDuplicateHighlightsCommand = defineSheetCommand<SheetDuplicateClearInput>(
  'range.clearDuplicateHighlights',
);

/** Public command for deleting duplicate row contents in a range. */
export const DeleteDuplicateRowsCommand = defineSheetCommand<SheetDuplicateDeleteInput>('range.deleteDuplicates');

/** Retention mode used by DeleteDuplicateRowsCommand. */
export const SheetDuplicateKeepMode = {
  First: 'first',
  Last: 'last',
} as const;

/** Type contract for SheetDuplicateKeepMode. */
export type SheetDuplicateKeepMode = (typeof SheetDuplicateKeepMode)[keyof typeof SheetDuplicateKeepMode];

/** Public input for duplicate highlighting. */
export interface SheetDuplicateHighlightInput extends SheetRangeInput {
  readonly columns?: readonly number[];
  readonly headerRow?: boolean;
  readonly highlight: SheetDuplicateHighlight;
}

/** Public input for clearing duplicate highlights. */
export interface SheetDuplicateClearInput extends SheetRangeInput {}

/** Public input for duplicate deletion. */
export interface SheetDuplicateDeleteInput extends SheetRangeInput {
  readonly columns?: readonly number[];
  readonly headerRow?: boolean;
  readonly keep?: SheetDuplicateKeepMode;
}

/** State access required by duplicate commands. */
export interface SheetDuplicateCommandDataSource extends DuplicateRangeDataSource {
  readonly duplicateTarget: PluginKey;
  readonly sheetDataTarget: PluginKey;
  readCell(row: number, column: number): CellMatrixElement | null;
  readCellText(cell: CellMatrixElement, row: number, column: number): string;
  readDisplayedText?(row: number, column: number): string;
  readDuplicateHighlight(row: number, column: number): SheetDuplicateHighlight | null;
}

/** Registers duplicate commands owned by SheetDuplicatePlugin. */
export function registerSheetDuplicateCommands(
  commands: SheetCommandBus,
  dataSource: SheetDuplicateCommandDataSource,
): void {
  commands.register(
    HighlightDuplicateRowsCommand,
    (input) =>
      new TransactionPipelineCommand(
        HighlightDuplicateRowsCommand.id,
        createSheetTransaction(dataSource.duplicateTarget, createHighlightDuplicateOperations(input, dataSource)),
      ),
  );
  commands.register(
    ClearDuplicateHighlightsCommand,
    (input) =>
      new TransactionPipelineCommand(
        ClearDuplicateHighlightsCommand.id,
        createSheetTransaction(dataSource.duplicateTarget, createClearDuplicateHighlightOperations(input, dataSource)),
      ),
  );
  commands.register(
    DeleteDuplicateRowsCommand,
    (input) =>
      new TransactionPipelineCommand(
        DeleteDuplicateRowsCommand.id,
        createSheetTransaction(dataSource.sheetDataTarget, createDeleteDuplicateRowsOperations(input, dataSource)),
      ),
  );
}

/** Creates sparse update operations for duplicate-value highlighting. */
export function createHighlightDuplicateOperations(
  input: SheetDuplicateHighlightInput,
  dataSource: SheetDuplicateCommandDataSource,
): UpdateCellOTOperation<SheetDuplicateHighlight | null>[] {
  assertSheetDuplicateHighlight(input.highlight);
  const range = normalizeDuplicateRange(input, dataSource);
  const duplicateCells = findDuplicateCells(input, dataSource);
  const operations: UpdateCellOTOperation<SheetDuplicateHighlight | null>[] = [];
  forEachDuplicateCell(range, (row, column) => {
    const next = duplicateCells.has(cellKey(row, column)) ? input.highlight : null;
    const previous = dataSource.readDuplicateHighlight(row, column);
    if (previous === next) return;
    operations.push(createUpdateCellOTOperation([row, column], next, previous));
  });
  return operations;
}

/** Creates sparse update operations that remove duplicate highlights from a range. */
export function createClearDuplicateHighlightOperations(
  input: SheetDuplicateClearInput,
  dataSource: SheetDuplicateCommandDataSource,
): UpdateCellOTOperation<SheetDuplicateHighlight | null>[] {
  const range = normalizeDuplicateRange(input, dataSource);
  const operations: UpdateCellOTOperation<SheetDuplicateHighlight | null>[] = [];
  forEachDuplicateCell(range, (row, column) => {
    const previous = dataSource.readDuplicateHighlight(row, column);
    if (previous === null) return;
    operations.push(createUpdateCellOTOperation([row, column], null, previous));
  });
  return operations;
}

/** Creates sheet-data operations that clear duplicate row contents in the selected range. */
export function createDeleteDuplicateRowsOperations(
  input: SheetDuplicateDeleteInput,
  dataSource: SheetDuplicateCommandDataSource,
): DeleteRowOTOperation<CellMatrixElement>[] {
  const duplicateRows = findRowsToDelete(input, dataSource);
  return [...duplicateRows]
    .sort((left, right) => right - left)
    .map((row) => createDeleteRowOTOperation([row], readDenseRow(dataSource, row)));
}

function findDuplicateCells(
  input: SheetDuplicateHighlightInput,
  dataSource: SheetDuplicateCommandDataSource,
): Set<string> {
  const groups = groupCells(input, dataSource);
  const cells = new Set<string>();
  groups.forEach((group) => {
    if (group.length <= 1) return;
    group.forEach(({ row, column }) => cells.add(cellKey(row, column)));
  });
  return cells;
}

function findRowsToDelete(input: SheetDuplicateDeleteInput, dataSource: SheetDuplicateCommandDataSource): Set<number> {
  const keep = input.keep ?? SheetDuplicateKeepMode.First;
  if (keep !== SheetDuplicateKeepMode.First && keep !== SheetDuplicateKeepMode.Last) {
    throw new SearError(`Unsupported duplicate keep mode "${String(keep)}".`);
  }
  const groups = groupRows(input, dataSource);
  const rows = new Set<number>();
  groups.forEach((group) => {
    if (group.length <= 1) return;
    const retained = keep === SheetDuplicateKeepMode.Last ? group[group.length - 1] : group[0];
    group.forEach((row) => {
      if (row !== retained) rows.add(row);
    });
  });
  return rows;
}

function groupRows(
  input: SheetDuplicateHighlightInput | SheetDuplicateDeleteInput,
  dataSource: SheetDuplicateCommandDataSource,
): Map<string, number[]> {
  const range = normalizeDuplicateRange(input, dataSource);
  const columns = normalizeColumns(input.columns, range.start[1], range.end[1]);
  const startRow = input.headerRow === true ? range.start[0] + 1 : range.start[0];
  const groups = new Map<string, number[]>();
  for (let row = startRow; row <= range.end[0]; row += 1) {
    const cells = columns.map((column) => dataSource.readCell(row, column));
    const values = cells.map((cell, index) => (cell === null ? '' : dataSource.readCellText(cell, row, columns[index])));
    if (values.every((value) => value === '')) continue;
    const key = JSON.stringify(values.map((value) => value.toLowerCase()));
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

function groupCells(
  input: SheetDuplicateHighlightInput,
  dataSource: SheetDuplicateCommandDataSource,
): Map<string, Array<{ readonly row: number; readonly column: number }>> {
  const range = normalizeDuplicateRange(input, dataSource);
  const startRow = input.headerRow === true ? range.start[0] + 1 : range.start[0];
  const groups = new Map<string, Array<{ readonly row: number; readonly column: number }>>();
  for (let row = startRow; row <= range.end[0]; row += 1) {
    for (let column = range.start[1]; column <= range.end[1]; column += 1) {
      const cell = dataSource.readCell(row, column);
      const key = (dataSource.readDisplayedText?.(row, column) ??
        (cell === null ? '' : dataSource.readCellText(cell, row, column))).toLowerCase();
      if (key === '') continue;
      const group = groups.get(key);
      if (group) group.push({ row, column });
      else groups.set(key, [{ row, column }]);
    }
  }
  return groups;
}

function cellKey(row: number, column: number): string {
  return `${row}:${column}`;
}

function normalizeColumns(columns: readonly number[] | undefined, startColumn: number, endColumn: number): number[] {
  if (columns === undefined || columns.length === 0) {
    const result: number[] = [];
    for (let column = startColumn; column <= endColumn; column += 1) result.push(column);
    return result;
  }
  const unique = [...new Set(columns)];
  unique.forEach((column) => {
    if (!Number.isInteger(column) || column < startColumn || column > endColumn) {
      throw new SearError(`Duplicate comparison column ${column} is outside the selected range.`);
    }
  });
  return unique.sort((left, right) => left - right);
}

function readDenseRow(dataSource: SheetDuplicateCommandDataSource, row: number): Array<CellMatrixElement | null> {
  const rowData: Array<CellMatrixElement | null> = [];
  for (let column = 0; column < dataSource.getColumnCount(); column += 1) {
    rowData.push(dataSource.readCell(row, column));
  }
  return rowData;
}
