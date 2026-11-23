import {
  createSheetTransaction,
  defineSheetCommand,
  SheetCommandBus,
  TransactionPipelineCommand,
  type SheetRangeInput,
} from '@searsuite/sear-assembly-commands';
import { type PluginKey } from '@searsuite/sear-assembly-plugin';
import { createUpdateCellOTOperation, type UpdateCellOTOperation } from '@searsuite/sear-domain-ot';
import { assertSheetCellFill, type SheetCellFill } from '../../CellFillMatrix';
import {
  forEachCellFillCell,
  normalizeCellFillCommandRange,
  type CellFillCommandRangeDataSource,
} from './CellFillCommandRange';

/** Public command for setting or clearing cell fill in a range. */
export const SetRangeCellFillCommand = defineSheetCommand<SheetSetRangeCellFillInput>('range.setCellFill');

/** Public input for setting or clearing cell fill in a range. */
export interface SheetSetRangeCellFillInput extends SheetRangeInput {
  readonly fill: SheetCellFill | null;
}

/** State access required by the cell-fill command. */
export interface SheetCellFillCommandDataSource extends CellFillCommandRangeDataSource {
  readonly target: PluginKey;
  readCellFill(row: number, column: number): SheetCellFill | null;
}

/** Registers the cell-fill command owned by SheetCellFillPlugin. */
export function registerSheetCellFillCommand(
  commands: SheetCommandBus,
  dataSource: SheetCellFillCommandDataSource,
): void {
  commands.register(
    SetRangeCellFillCommand,
    (input) =>
      new TransactionPipelineCommand(
        SetRangeCellFillCommand.id,
        createSheetTransaction(dataSource.target, createSetRangeCellFillOperations(input, dataSource)),
      ),
  );
}

/** Creates sparse update operations for a cell-fill range. */
export function createSetRangeCellFillOperations(
  input: SheetSetRangeCellFillInput,
  dataSource: SheetCellFillCommandDataSource,
): UpdateCellOTOperation<SheetCellFill>[] {
  if (input.fill !== null) assertSheetCellFill(input.fill);
  const range = normalizeCellFillCommandRange(input, dataSource);
  const operations: UpdateCellOTOperation<SheetCellFill>[] = [];
  forEachCellFillCell(range, (row, column) => {
    operations.push(createUpdateCellOTOperation([row, column], input.fill, dataSource.readCellFill(row, column)));
  });
  return operations;
}
