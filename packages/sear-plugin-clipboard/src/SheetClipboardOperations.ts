import { createUpdateCellOTOperation, type Operation, type UpdateCellOTOperation } from '@searsuite/sear-domain-ot';
import type { SheetClipboardDataSource, SheetClipboardDecodedRow } from './SheetClipboardContracts';
import type { CellFormat } from '@searsuite/sear-domain-cell-types';
import type { SheetClipboardRangeInput } from './SheetClipboardCommands';

export function createClearOperations(range: SheetClipboardRangeInput, source: SheetClipboardDataSource): Operation[] {
  const operations: Operation[] = [];
  forEachRangeCell(range, (row, column) => {
    const previous = source.readCell(row, column);
    if (previous !== null) operations.push(createUpdateOperation(row, column, null, previous));
  });
  return operations;
}

export function createPasteOperations(
  target: [number, number],
  rows: readonly SheetClipboardDecodedRow[],
  source: SheetClipboardDataSource,
): Operation[] {
  const operations: Operation[] = [];
  rows.forEach((row, rowOffset) =>
    row.forEach((cell, columnOffset) => {
      const rowIndex = target[0] + rowOffset;
      const columnIndex = target[1] + columnOffset;
      operations.push(createUpdateOperation(rowIndex, columnIndex, cell, source.readCell(rowIndex, columnIndex)));
    }),
  );
  return operations;
}

export function createClearFormatOperations(
  range: SheetClipboardRangeInput,
  source: SheetClipboardDataSource,
): Operation[] {
  const operations: Operation[] = [];
  forEachRangeCell(range, (row, column) => {
    const previous = source.readCellFormat(row, column);
    if (previous !== null) operations.push(createUpdateCellOTOperation([row, column], null, previous));
  });
  return operations;
}

export function createPasteFormatOperations(
  target: [number, number],
  rows: readonly (readonly (CellFormat | null)[])[],
  source: SheetClipboardDataSource,
): Operation[] {
  const operations: Operation[] = [];
  rows.forEach((row, rowOffset) =>
    row.forEach((format, columnOffset) => {
      const rowIndex = target[0] + rowOffset;
      const columnIndex = target[1] + columnOffset;
      operations.push(
        createUpdateCellOTOperation([rowIndex, columnIndex], format, source.readCellFormat(rowIndex, columnIndex)),
      );
    }),
  );
  return operations;
}

function createUpdateOperation(
  row: number,
  column: number,
  value: SheetClipboardDecodedRow[number],
  prev: SheetClipboardDecodedRow[number],
): UpdateCellOTOperation<SheetClipboardDecodedRow[number]> {
  return createUpdateCellOTOperation([row, column], value, prev);
}

function forEachRangeCell(range: SheetClipboardRangeInput, callback: (row: number, column: number) => void): void {
  for (let row = range.start[0]; row <= range.end[0]; row++) {
    for (let column = range.start[1]; column <= range.end[1]; column++) callback(row, column);
  }
}
