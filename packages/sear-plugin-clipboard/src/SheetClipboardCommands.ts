import { defineSheetCommand, LocalActionCommand, type SheetCommandBus, type SheetCommandResult } from '@searsuite/sear-assembly-commands';
import { Pipeline } from '@searsuite/sear-assembly-core';
import { Plugin, PluginKey, type PluginExtension } from '@searsuite/sear-assembly-plugin';
import { Transaction } from '@searsuite/sear-domain-transaction';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { type CellProperties } from '@searsuite/sear-render-registry';
import {
  SheetClipboardCodecSymbol,
  SheetClipboardDataSourceSymbol,
  type SheetClipboardCellPoint,
  type SheetClipboardCodec,
  type SheetClipboardDataSource,
  type SheetClipboardPayload,
} from './SheetClipboardContracts';
import { CopyRangeSheetCommand } from './CopyRangeSheetCommand';
import { CutRangeSheetCommand } from './CutRangeSheetCommand';
import { PasteRangeSheetCommand } from './PasteRangeSheetCommand';
import { SheetPasteMode } from './SheetPasteMode';

/** Optional explicit range; omitted means the current editor selection. */
export interface SheetCopyRangeInput {
  readonly range?: SheetClipboardRangeInput;
}

/** Inclusive range accepted by clipboard commands. */
export interface SheetClipboardRangeInput {
  readonly start: SheetClipboardCellPoint;
  readonly end: SheetClipboardCellPoint;
}

/** Result shared by copy and cut commands. */
export interface SheetClipboardCommandResult extends SheetCommandResult {
  readonly range: SheetClipboardRangeInput;
  readonly payload: SheetClipboardPayload;
}

/** Committed target range, used by hosts to select the pasted cells. */
export interface SheetPasteRangeResult extends SheetCommandResult {
  readonly range: SheetClipboardRangeInput;
  readonly workbookMove?: true;
}

/** Input for pasting a previously decoded or host-read clipboard payload. */
export interface SheetPasteRangeInput {
  readonly payload: SheetClipboardPayload;
  /** Top-left target; omitted means the current selection's top-left cell. */
  readonly target?: SheetClipboardCellPoint;
  /** Structured channel selection. Plain-text payloads contain values only. */
  readonly mode?: SheetPasteMode;
}

/** Typed command that snapshots a range without mutating sheet state. */
export const CopyRangeCommand = defineSheetCommand<SheetCopyRangeInput | void, SheetClipboardCommandResult>(
  'clipboard.copyRange',
);
export const CopyCommand = CopyRangeCommand;

/** Typed command that snapshots and clears a range in one sheet transaction. */
export const CutRangeCommand = defineSheetCommand<SheetCopyRangeInput | void, SheetClipboardCommandResult>(
  'clipboard.cutRange',
);
export const CutCommand = CutRangeCommand;

/** Cancels a pending cut without changing any cell content. */
export const CancelCutRangeCommand = defineSheetCommand<void>('clipboard.cancelCutRange');

/** Typed command that decodes and writes a payload through the normal sheet transaction boundary. */
export const PasteRangeCommand = defineSheetCommand<SheetPasteRangeInput, SheetPasteRangeResult>(
  'clipboard.pasteRange',
);
export const PasteCommand = PasteRangeCommand;

const pluginKey = new PluginKey('SheetClipboard');

/** Default sheet clipboard plugin. System clipboard I/O remains a host-owned SheetClipboardPort. */
@Injectable()
export class SheetClipboardPlugin
  extends Plugin<unknown, CellProperties, Record<string, never>>
  implements PluginExtension<SheetCommandBus>
{
  public static readonly symbol = Symbol.for('SheetClipboardPlugin');
  public static readonly pluginKey = pluginKey;

  public constructor(
    @Inject(SheetClipboardDataSourceSymbol)
    private readonly source: SheetClipboardDataSource,
    @Inject(SheetClipboardCodecSymbol)
    private readonly codec: SheetClipboardCodec,
  ) {
    super({ key: pluginKey, state: {} });
  }

  /** Registers the three semantic clipboard commands on this editor's bus. */
  public registerCommands(commands: SheetCommandBus): void {
    commands.register(CopyRangeCommand, (input) => new CopyRangeSheetCommand(this.source, this.codec, input));
    commands.register(CutRangeCommand, (input) => new CutRangeSheetCommand(this.source, this.codec, input));
    commands.register(CancelCutRangeCommand, () =>
      new LocalActionCommand(CancelCutRangeCommand.id, () => this.source.cutSession?.cancel()));
    commands.register(PasteRangeCommand, (input) => new PasteRangeSheetCommand(this.source, this.codec, input));
  }

  public registerState() {
    return { key: this.key, state: this.getState(), dataEngine: { enabled: false } };
  }

  public apply(state: Record<string, never>, _transaction: Transaction): Record<string, never> {
    return state;
  }

  public getPluginConfig(): null {
    return null;
  }

  public render(): [] {
    return [];
  }
}
