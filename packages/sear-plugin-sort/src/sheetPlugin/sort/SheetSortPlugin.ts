import { defineSheetCommand, type SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { Pipeline } from '@searsuite/sear-assembly-core';
import { Plugin, PluginKey, type SheetRangeReorderRegistry } from '@searsuite/sear-assembly-plugin';
import { type CellMatrixElement } from '@searsuite/sear-domain-cell-types';
import { type CSRMatrix } from '@searsuite/sear-domain-matrix';
import { createTransaction, type Transaction } from '@searsuite/sear-domain-transaction';
import { Injectable } from '@searsuite/sear-foundation-di';
import { type Platform } from '@searsuite/sear-foundation-platform';
import { CommandExecutionPhase } from '@searsuite/sear-foundation-common';
import { type CellProperties } from '@searsuite/sear-render-registry';
import { createSheetSortPermutation } from '../../createSheetSortPermutation';
import { type SheetSortRangeInput, type SheetSortValue } from '../../SheetSortTypes';

export const SortSheetRangeCommand = defineSheetCommand<SheetSortRangeInput>('sheet.sortRange');

export interface SheetSortDependencies {
  readonly readMatrix: () => CSRMatrix<CellMatrixElement>;
  readonly readValue: (row: number, column: number) => SheetSortValue;
  readonly reorders: SheetRangeReorderRegistry;
  readonly platform: Pick<Platform, 'toLowerCase'>;
  readonly compareText: (left: string, right: string) => number;
  /** Repairs a selection hidden by the committed permutation. */
  readonly reconcileSelection?: () => void;
}

const pluginKey = new PluginKey('SheetSortPlugin');

/** Stateless command owner for stable range sorting. */
@Injectable()
export class SheetSortPlugin extends Plugin<unknown, CellProperties, Record<string, never>> {
  public override readonly warnOnDuplicateDepth = false;
  public static readonly symbol = Symbol.for('SheetSortPlugin');
  public static readonly pluginKey = pluginKey;
  private disposeCommandListener: (() => void) | null = null;

  public constructor(private readonly dependencies: SheetSortDependencies) { super({ key: pluginKey, state: {} }); }

  public registerCommands(commands: SheetCommandBus): void {
    this.disposeCommandListener?.();
    this.disposeCommandListener = commands.subscribe((event) => {
      if (event.id === SortSheetRangeCommand.id && event.phase === CommandExecutionPhase.Completed)
        this.dependencies.reconcileSelection?.();
    });
    commands.register(SortSheetRangeCommand, (input) => ({
      id: SortSheetRangeCommand.id,
      execute: () => {
        const permutation = createSheetSortPermutation(
          input, this.dependencies.readMatrix(), this.dependencies.readValue,
          this.dependencies.platform, this.dependencies.compareText,
        );
        const pipeline = new Pipeline(SortSheetRangeCommand.id);
        const plans = this.dependencies.reorders.plan(permutation);
        if (!permutation.changed) return { pipeline };
        plans.forEach(({ target, operations }) => {
          if (operations.length) pipeline.addTransaction(
            SortSheetRangeCommand.id,
            createTransaction(target, operations),
          );
        });
        return { pipeline };
      },
    }));
  }

  public dispose(): void {
    this.disposeCommandListener?.();
    this.disposeCommandListener = null;
  }

  public registerState() { return { key: this.key, state: this.getState(), dataEngine: { enabled: false } }; }
  public apply(state: Record<string, never>, _transaction: Transaction): Record<string, never> { return state; }
  public getPluginConfig(): null { return null; }
  public render(): [] { return []; }
}
