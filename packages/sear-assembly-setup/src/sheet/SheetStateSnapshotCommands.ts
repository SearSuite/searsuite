import { Pipeline } from '@searsuite/sear-assembly-core';
import { type PluginKey, type PluginManager } from '@searsuite/sear-assembly-plugin';
import { type Transaction } from '@searsuite/sear-domain-transaction';
import {
  defineSheetCommand,
  type SheetCommand,
  type SheetCommandBus,
  type SheetCommandContext,
  type SheetCommandResult,
} from '@searsuite/sear-assembly-commands';
import { type CellProperties } from '@searsuite/sear-render-registry';
import { type SearCoreSheet } from '@searsuite/sear-assembly-core';
import { type SheetDocumentState } from './SheetEditorContracts';
import { requireCompleteSheetDocumentState } from './SheetDocumentStateExportCodecs';
import { cloneSheetDocumentState } from './cloneSheetDocumentState';

/**
 * Command result for exporting the current sheet state snapshot.
 *
 * The pipeline is intentionally empty: exporting state must not mutate OT state,
 * request rendering, or produce local effects.
 */
export interface ExportSheetStateCommandResult extends SheetCommandResult {
  /** Cloned state payload suitable for workbook persistence or sheet remounting. */
  readonly sheetState: SheetDocumentState;
}

/** Host command that exports a cloned state snapshot for the active SheetEditor. */
export const ExportSheetStateCommand = defineSheetCommand<void, ExportSheetStateCommandResult>('sheet.exportState');

/** Registers sheet state snapshot commands for the default sheet assembly. */
export function registerSheetStateSnapshotCommands(
  commands: SheetCommandBus,
  pluginManager: PluginManager<SearCoreSheet, CellProperties>,
): void {
  commands.register(ExportSheetStateCommand, function createExportSheetStateCommand() {
    return new ExportSheetStateSnapshotCommand(pluginManager);
  });
}

class ExportSheetStateSnapshotCommand implements SheetCommand<ExportSheetStateCommandResult> {
  readonly #pluginManager: PluginManager<SearCoreSheet, CellProperties>;

  /** Stable command id mirrored from ExportSheetStateCommand. */
  public readonly id = ExportSheetStateCommand.id;

  /** Creates a command that reads and clones the current sheet state. */
  public constructor(pluginManager: PluginManager<SearCoreSheet, CellProperties>) {
    this.#pluginManager = pluginManager;
  }

  /** Returns the cloned sheet state without mutating editor state. */
  public execute(_context: SheetCommandContext): ExportSheetStateCommandResult {
    return {
      pipeline: new Pipeline(this.id),
      sheetState: captureSheetDocumentState(this.#pluginManager),
    };
  }
}

/** Captures owner-contributed document state after staging, without committing it. */
export function previewSheetDocumentState(
  core: SearCoreSheet,
  pluginManager: PluginManager<SearCoreSheet, CellProperties>,
  transactions: readonly Transaction[],
): SheetDocumentState {
  return captureSheetDocumentState(pluginManager, core.previewTransactionStates(transactions));
}

function captureSheetDocumentState(
  pluginManager: PluginManager<SearCoreSheet, CellProperties>,
  stagedStates?: ReadonlyMap<PluginKey, unknown>,
): SheetDocumentState {
  const partial = pluginManager.getDocumentStateContributions().reduce<Partial<SheetDocumentState>>(
    (state, registration) => {
      const pluginState = stagedStates?.has(registration.plugin.key)
        ? stagedStates.get(registration.plugin.key)
        : registration.plugin.getState();
      const captured = registration.contribution.capture(pluginState);
      return captured ? { ...state, ...captured } : state;
    },
    {},
  );
  return cloneSheetDocumentState(requireCompleteSheetDocumentState(partial, 'sheet'));
}
