import { Plugin, PluginKey } from '@searsuite/sear-assembly-plugin';
import { SheetCommandBus, SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import {
  CellClipboardCodecRegistry,
  CellCommitStrategyRegistry,
  SheetCellInputValidationRegistry,
} from '@searsuite/sear-domain-cell-types';
import { type Transaction } from '@searsuite/sear-domain-transaction';
import { Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';

import { SheetDataPlugin } from '@searsuite/sear-plugin-sheet-data';
import { registerSheetFindReplaceCommands, registerSheetFindReplaceQueries } from '../../SheetFindReplaceCommands';
import { type SheetFindSource } from '../../findSheetMatches';

const key = new PluginKey('SheetFindReplacePlugin');

/** Stateless Sheet feature; matches always read the current staged data owner. */
@Injectable()
export class SheetFindReplacePlugin extends Plugin<null> {
  readonly #data: SheetDataPlugin;
  readonly #codecs: CellClipboardCodecRegistry;
  readonly #commits: CellCommitStrategyRegistry;
  readonly #projection: Pick<
    SheetFindSource,
    'readValue' | 'forEachProjectedValueInRange' | 'isArrayResultAnchor' | 'isCoveredMergeCell' | 'isRowHidden'
  >;
  readonly #inputValidation: SheetCellInputValidationRegistry | undefined;

  public static readonly symbol = Symbol.for('SheetFindReplacePlugin');
  public static readonly pluginKey = key;
  public readonly warnOnDuplicateDepth = false;
  #revision = 0;
  #commands: SheetCommandBus | null = null;

  public constructor(
    data: SheetDataPlugin,
    codecs: CellClipboardCodecRegistry,
    commits: CellCommitStrategyRegistry,
    projection: Pick<
      SheetFindSource,
      'readValue' | 'forEachProjectedValueInRange' | 'isArrayResultAnchor' | 'isCoveredMergeCell' | 'isRowHidden'
    > = {},
    inputValidation?: SheetCellInputValidationRegistry,
  ) {
    super({ key, state: null });
    this.#data = data;
    this.#codecs = codecs;
    this.#commits = commits;
    this.#projection = projection;
    this.#inputValidation = inputValidation;
  }

  public registerCommands(commands: SheetCommandBus): void {
    if (this.#commands && this.#commands !== commands) {
      throw new SearError('Sheet find commands are already bound to an editor.');
    }
    this.#commands = commands;
    registerSheetFindReplaceCommands(commands, this.#source());
  }

  public registerQueries(queries: SheetQueryRegistry): void {
    registerSheetFindReplaceQueries(queries, this.#source());
  }

  public registerState() {
    return { key: this.key, state: this.getState() };
  }
  public apply(_state: null, _transaction: Transaction): null {
    return null;
  }
  public override onTransactionCommitted(transaction: Transaction): void {
    if (this.#commands && !this.#commands.isExecuting()) {
      throw new SearError('Sheet find changes must run through editor.commands.run(...).');
    }
    if (transaction.pluginKey === SheetDataPlugin.pluginKey) this.#revision += 1;
  }

  #source() {
    const plugin = this;
    return {
      get matrix() {
        return plugin.#data.getState().sheetData;
      },
      getRevision: () => plugin.#revision,
      codecs: this.#codecs,
      commitStrategies: this.#commits,
      ...(this.#inputValidation ? { inputValidation: this.#inputValidation } : {}),
      ...this.#projection,
    };
  }
}
