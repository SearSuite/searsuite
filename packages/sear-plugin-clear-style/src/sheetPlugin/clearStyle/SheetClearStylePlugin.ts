import { createSheetTransaction, type SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { Pipeline } from '@searsuite/sear-assembly-core';
import { Plugin, PluginKey } from '@searsuite/sear-assembly-plugin';
import { Injectable } from '@searsuite/sear-foundation-di';
import { type CellProperties } from '@searsuite/sear-render-registry';
import { ClearRangeStylesCommand } from '../../ClearRangeStylesCommand';
import { type SheetClearStyleOptions } from '../../SheetClearStyleOptions';
import { normalizeClearStyleRange } from '../../normalizeClearStyleRange';

/** Composes owner-defined format clearing; owns no persisted document or session state. */
@Injectable()
export class SheetClearStylePlugin extends Plugin<unknown, CellProperties, null> {
  readonly #options: SheetClearStyleOptions;

  public static readonly symbol = Symbol.for('SheetClearStylePlugin');
  public override readonly warnOnDuplicateDepth = false;

  public constructor(options: SheetClearStyleOptions) {
    super({ key: new PluginKey('SheetClearStylePlugin'), state: null });
    this.#options = options;
  }

  public registerCommands(commands: SheetCommandBus): void {
    commands.register(ClearRangeStylesCommand, (input) => {
      const ranges = ('ranges' in input ? input.ranges : [input]).map((range) =>
        normalizeClearStyleRange(range, this.#options.readShape()),
      );
      const pipeline = new Pipeline(ClearRangeStylesCommand.id);
      ranges.forEach((range) => {
        this.#options.formats.clear(range).forEach((plan) => {
          if (plan.operations.length)
            pipeline.addTransaction('clearStyle.owner', createSheetTransaction(plan.target, [...plan.operations]));
        });
      });
      return { id: ClearRangeStylesCommand.id, execute: () => ({ pipeline }) };
    });
  }

  public registerState() {
    return { key: this.key, state: null, dataEngine: { enabled: false } };
  }
  public getPluginConfig(): null {
    return null;
  }
  public apply(): null {
    return null;
  }
  public render(): null {
    return null;
  }
}
