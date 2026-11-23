import {
  createSheetTransaction,
  defineSheetCommand,
  SheetCommandBus,
  TransactionPipelineCommand,
  type SheetRangeInput,
} from '@searsuite/sear-assembly-commands';
import { type PluginKey } from '@searsuite/sear-assembly-plugin';
import { adjustCellFormatDecimalPlaces, type CellFormat, normalizeCellFormat } from '@searsuite/sear-domain-cell-types';
import { createUpdateCellOTOperation, type UpdateCellOTOperation } from '@searsuite/sear-domain-ot';
import {
  forEachCellFormatCell,
  normalizeCellFormatCommandRange,
  type CellFormatCommandRangeDataSource,
} from './CellFormatCommandRange';

/** Public command for setting or clearing the number format of a cell range. */
export const SetRangeCellFormatCommand = defineSheetCommand<SheetSetRangeCellFormatInput>('range.setCellFormat');

/** Public command for increasing or decreasing a range's visible decimal places. */
export const AdjustRangeCellFormatDecimalPlacesCommand = defineSheetCommand<SheetAdjustRangeCellFormatDecimalsInput>(
  'range.adjustCellFormatDecimalPlaces',
);

/** Input accepted by SetRangeCellFormatCommand. */
export type SheetSetRangeCellFormatInput =
  | (SheetRangeInput & { readonly format: CellFormat | null })
  | { readonly ranges: readonly SheetRangeInput[]; readonly format: CellFormat | null };

/** Input accepted by AdjustRangeCellFormatDecimalPlacesCommand. */
export interface SheetAdjustRangeCellFormatDecimalsInput extends SheetRangeInput {
  readonly delta: number;
}

/** State access required by the cell-format command. */
export interface SheetCellFormatCommandDataSource extends CellFormatCommandRangeDataSource {
  readonly target: PluginKey;
  readCellFormat(row: number, column: number): CellFormat | null;
}

/** Registers the command owned by SheetCellFormatPlugin. */
export function registerSheetCellFormatCommand(
  commands: SheetCommandBus,
  dataSource: SheetCellFormatCommandDataSource,
): void {
  commands.register(
    SetRangeCellFormatCommand,
    (input) =>
      new TransactionPipelineCommand(
        SetRangeCellFormatCommand.id,
        createSheetTransaction(dataSource.target, createSetRangeCellFormatOperations(input, dataSource)),
      ),
  );
  commands.register(
    AdjustRangeCellFormatDecimalPlacesCommand,
    (input) =>
      new TransactionPipelineCommand(
        AdjustRangeCellFormatDecimalPlacesCommand.id,
        createSheetTransaction(dataSource.target, createAdjustCellFormatDecimalOperations(input, dataSource)),
      ),
  );
}

/** Creates sparse MatrixOT updates for one format range. */
export function createSetRangeCellFormatOperations(
  input: SheetSetRangeCellFormatInput,
  dataSource: SheetCellFormatCommandDataSource,
): UpdateCellOTOperation<CellFormat>[] {
  const format = input.format === null ? null : normalizeCellFormat(input.format);
  const ranges = ('ranges' in input ? input.ranges : [input]).map((range) =>
    normalizeCellFormatCommandRange(range, dataSource),
  );
  const operations: UpdateCellOTOperation<CellFormat>[] = [];
  const seen = new Set<string>();
  ranges.forEach((range) => {
    forEachCellFormatCell(range, (row, column) => {
      const key = `${row}:${column}`;
      if (seen.has(key)) return;
      seen.add(key);
      operations.push(createUpdateCellOTOperation([row, column], format, dataSource.readCellFormat(row, column)));
    });
  });
  return operations;
}

/** Creates sparse MatrixOT updates for a decimal-place adjustment. */
export function createAdjustCellFormatDecimalOperations(
  input: SheetAdjustRangeCellFormatDecimalsInput,
  dataSource: SheetCellFormatCommandDataSource,
): UpdateCellOTOperation<CellFormat>[] {
  const range = normalizeCellFormatCommandRange(input, dataSource);
  const delta = Number.isFinite(input.delta) ? Math.trunc(input.delta) : 0;
  const operations: UpdateCellOTOperation<CellFormat>[] = [];
  forEachCellFormatCell(range, (row, column) => {
    const previous = dataSource.readCellFormat(row, column);
    const format = adjustCellFormatDecimalPlaces(previous, delta);
    operations.push(createUpdateCellOTOperation([row, column], format, previous));
  });
  return operations;
}
