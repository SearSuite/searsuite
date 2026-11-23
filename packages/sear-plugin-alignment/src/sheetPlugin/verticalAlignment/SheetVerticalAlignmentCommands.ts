import {
  createSheetTransaction,
  defineSheetCommand,
  SheetCommandBus,
  TransactionPipelineCommand,
  type SheetRangeInput,
} from '@searsuite/sear-assembly-commands';
import { type PluginKey } from '@searsuite/sear-assembly-plugin';
import { SheetVerticalAlignment, assertSheetVerticalAlignment } from '@searsuite/sear-domain-cell-types';
import { createUpdateCellOTOperation, type UpdateCellOTOperation } from '@searsuite/sear-domain-ot';
import {
  forEachAlignmentCell,
  normalizeAlignmentCommandRange,
  type AlignmentCommandRangeDataSource,
} from '../AlignmentCommandRange';

/** Public command for setting vertical alignment in a range. */
export const SetRangeVerticalAlignmentCommand =
  defineSheetCommand<SheetSetRangeVerticalAlignmentInput>('range.setVerticalAlignment');

/** Public input for setting vertical alignment in a range. */
export interface SheetSetRangeVerticalAlignmentInput extends SheetRangeInput {
  readonly verticalAlignment: SheetVerticalAlignment;
}

/** State access required by the vertical alignment command. */
export interface SheetVerticalAlignmentCommandDataSource extends AlignmentCommandRangeDataSource {
  readonly target: PluginKey;
  readCellVerticalAlignment(row: number, column: number): SheetVerticalAlignment | null;
}

type SheetVerticalAlignmentReader = AlignmentCommandRangeDataSource &
  Pick<SheetVerticalAlignmentCommandDataSource, 'readCellVerticalAlignment'>;

/** Registers the vertical alignment command owned by SheetVerticalAlignmentPlugin. */
export function registerSheetVerticalAlignmentCommand(
  commands: SheetCommandBus,
  dataSource: SheetVerticalAlignmentCommandDataSource,
): void {
  commands.register(
    SetRangeVerticalAlignmentCommand,
    (input) =>
      new TransactionPipelineCommand(
        SetRangeVerticalAlignmentCommand.id,
        createSheetTransaction(dataSource.target, createSetRangeVerticalAlignmentOperations(input, dataSource)),
      ),
  );
}

/** Creates sparse UpdateCell operations for vertical alignment. */
export function createSetRangeVerticalAlignmentOperations(
  input: SheetSetRangeVerticalAlignmentInput,
  dataSource: SheetVerticalAlignmentReader,
): UpdateCellOTOperation<SheetVerticalAlignment>[] {
  assertSheetVerticalAlignment(input.verticalAlignment);
  const range = normalizeAlignmentCommandRange(input, dataSource);
  const value = input.verticalAlignment === SheetVerticalAlignment.Center ? null : input.verticalAlignment;
  const operations: UpdateCellOTOperation<SheetVerticalAlignment>[] = [];
  forEachAlignmentCell(range, (row, column) => {
    operations.push(
      createUpdateCellOTOperation([row, column], value, dataSource.readCellVerticalAlignment(row, column)),
    );
  });
  return operations;
}
