import {
  createSheetTransaction,
  defineSheetCommand,
  SheetCommandBus,
  TransactionPipelineCommand,
} from '@searsuite/sear-assembly-commands';
import { type PluginKey } from '@searsuite/sear-assembly-plugin';
import { createUpdateCellOTOperation, type UpdateCellOTOperation } from '@searsuite/sear-domain-ot';

/** Sets the fixed state for a contiguous row range. */
export const SetSheetRowsFixedCommand = defineSheetCommand<SheetSetRowsFixedInput>('sheet.setRowsFixed');

/** Public input for fixing or unfixing rows. */
export interface SheetSetRowsFixedInput {
  readonly index: number;
  readonly count?: number;
  readonly fixed: boolean;
}

/** Fixed-row state needed to validate and create invertible command operations. */
export interface SheetFixedRowCommandDataSource {
  readonly target: PluginKey;
  getRowCount(): number;
  isRowFixed(index: number): boolean;
}

/** Registers the fixed-row command against one plugin-owned state source. */
export function registerSheetFixedRowCommands(
  commands: SheetCommandBus,
  dataSource: SheetFixedRowCommandDataSource,
): void {
  commands.register(
    SetSheetRowsFixedCommand,
    (input) =>
      new TransactionPipelineCommand(
        SetSheetRowsFixedCommand.id,
        createSheetTransaction(dataSource.target, createSetSheetRowsFixedOperations(input, dataSource)),
      ),
  );
}

/** Creates sparse, invertible fixed-row updates for a normalized row range. */
export function createSetSheetRowsFixedOperations(
  input: SheetSetRowsFixedInput,
  dataSource: SheetFixedRowCommandDataSource,
): UpdateCellOTOperation<boolean>[] {
  const count = input.count ?? 1;
  const rowCount = dataSource.getRowCount();
  if (!Number.isInteger(input.index) || input.index < 0 || input.index >= rowCount) {
    throw new RangeError(`Fixed-row index ${input.index} is outside the sheet row range.`);
  }
  if (!Number.isInteger(count) || count <= 0 || input.index + count > rowCount) {
    throw new RangeError(`Fixed-row count ${count} is outside the sheet row range.`);
  }

  const operations: UpdateCellOTOperation<boolean>[] = [];
  for (let row = input.index; row < input.index + count; row++) {
    const previous = dataSource.isRowFixed(row);
    if (previous === input.fixed) continue;
    operations.push(createUpdateCellOTOperation([0, row], input.fixed ? true : null, previous ? true : null));
  }
  return operations;
}
