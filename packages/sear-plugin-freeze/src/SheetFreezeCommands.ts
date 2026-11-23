import { createSheetTransaction, defineSheetCommand, SheetCommandBus, TransactionPipelineCommand } from '@searsuite/sear-assembly-commands';
import { type PluginKey } from '@searsuite/sear-assembly-plugin';
import { createUpdateCellOTOperation, type UpdateCellOTOperation } from '@searsuite/sear-domain-ot';
import { SearError } from '@searsuite/sear-foundation-error';
import { type SheetFreezeState } from './SheetFreezeField';

/** Replaces both freeze boundaries in one transaction. */
export const SetSheetFreezeCommand = defineSheetCommand<SheetFreezeState>('sheet.setFreeze');

/** Supplies current boundaries and sheet dimensions to the command factory. */
export interface SheetFreezeCommandSource {
  /** Owner of the persistent freeze matrix. */
  readonly target: PluginKey;
  /** Reads the currently committed freeze boundaries. */
  read(): SheetFreezeState;
  /** Reads the current row and column counts. */
  shape(): readonly [number, number];
}

/** Creates invertible updates for the changed freeze boundaries. */
export function createSetSheetFreezeOperations(
  input: SheetFreezeState,
  source: SheetFreezeCommandSource,
): UpdateCellOTOperation<number | null>[] {
  const [rowCount, columnCount] = source.shape();
  if (!Number.isInteger(input.rows) || input.rows < 0 || (input.rows > 0 && input.rows >= rowCount) ||
      !Number.isInteger(input.columns) || input.columns < 0 || (input.columns > 0 && input.columns >= columnCount)) {
    throw new SheetFreezeBoundaryError(input, rowCount, columnCount);
  }
  const previous = source.read();
  const operations: UpdateCellOTOperation<number | null>[] = [];
  if (previous.rows !== input.rows) operations.push(createUpdateCellOTOperation([0, 0], input.rows || null, previous.rows || null));
  if (previous.columns !== input.columns) operations.push(createUpdateCellOTOperation([0, 1], input.columns || null, previous.columns || null));
  return operations;
}

/** Public invalid-boundary error with stable diagnostics. */
export class SheetFreezeBoundaryError extends SearError {
  public override readonly code = 'SHEET_FREEZE_INVALID_BOUNDARY';
  public constructor(input: SheetFreezeState, rowCount: number, columnCount: number) {
    super('Sheet freeze boundary is outside the sheet.', { input, rowCount, columnCount });
  }
}

/** Registers the freeze command on an editor-local command bus. */
export function registerSheetFreezeCommands(commands: SheetCommandBus, source: SheetFreezeCommandSource): void {
  commands.register(SetSheetFreezeCommand, (input) => new TransactionPipelineCommand(
    SetSheetFreezeCommand.id,
    createSheetTransaction(source.target, createSetSheetFreezeOperations(input, source)),
  ));
}
