import { type SheetRangeMoveRegistry, type SheetStructureMoveRegistry } from '@searsuite/sear-assembly-plugin';
import { type SearCoreSheet } from '@searsuite/sear-assembly-core';
import { Plugin, PluginKey, type PluginStateRegistration } from '@searsuite/sear-assembly-plugin';
import {
  PublishSheetDisplayedValueChangesCommand,
  type SheetPluginRuntimeContext,
  type SheetPluginSetupContext,
} from '@searsuite/sear-assembly-setup';
import { SearContractViolationError } from '@searsuite/sear-assembly-core';
import { type IFormulaResultProvider, type IFormulaSourceProvider } from '@searsuite/sear-domain-formula-engine';
import { type Transaction } from '@searsuite/sear-domain-transaction';
import { type CellProperties } from '@searsuite/sear-render-registry';
import { type Node } from '@searsuite/sear-render-node';
import { SheetDataPlugin } from '@searsuite/sear-render-engine';
import type { WorkbookFormulaPlugin } from '../formula/WorkbookFormulaPlugin';
import type { WorkbookSheetId } from '@searsuite/sear-domain-workbook';
import { type ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { WorkbookFormulaStructureResultsChangedObservation } from '../../WorkbookFormulaObservations';

const workbookFormulaCompanionPluginKey = new PluginKey('WorkbookFormulaCompanion');

export class WorkbookFormulaCompanionSheetPlugin extends Plugin<SearCoreSheet, CellProperties, null> {
  public static readonly symbol: symbol = Symbol('WorkbookFormulaCompanionSheetPlugin');
  readonly #workbookFormula: WorkbookFormulaPlugin;
  readonly #sheetId: WorkbookSheetId;
  readonly #workbookObservations: ObservationRegistry;

  public constructor(
    workbookFormula: WorkbookFormulaPlugin,
    sheetId: WorkbookSheetId,
    workbookObservations: ObservationRegistry,
  ) {
    super({ key: workbookFormulaCompanionPluginKey, state: null });
    this.#workbookFormula = workbookFormula;
    this.#sheetId = sheetId;
    this.#workbookObservations = workbookObservations;
  }

  private unregisterFormulaResultProvider: (() => void) | null = null;
  private unregisterFormulaSourceProvider: (() => void) | null = null;
  #isSheetCommandExecuting: (() => boolean) | null = null;
  #unsubscribeStructureResults: (() => void) | null = null;

  public configure(context: SheetPluginSetupContext): void {
    const provider: IFormulaResultProvider = {
      getFormulaResult: (row, col) => this.#workbookFormula.getSheetFormulaResult(this.#sheetId, row, col),
    };
    this.unregisterFormulaResultProvider = context.runtime.formula.results.register({ provider, priority: 100 });
    const sourceProvider: IFormulaSourceProvider = {
      getFormulaSource: (row, col) => this.#workbookFormula.getSheetFormulaSource(this.#sheetId, row, col),
    };
    this.unregisterFormulaSourceProvider = context.runtime.formula.sources.register({
      provider: sourceProvider,
      priority: 100,
    });
  }

  public initialize(context: SheetPluginRuntimeContext): void {
    if (this.#isSheetCommandExecuting) {
      throw new SearContractViolationError('Workbook formula Sheet companion is already bound to an editor.');
    }
    this.#isSheetCommandExecuting = context.runtime.commands.isExecuting.bind(context.runtime.commands);
    this.#unsubscribeStructureResults = this.#workbookObservations.subscribe(
      WorkbookFormulaStructureResultsChangedObservation,
      (cells) => {
        const localCells = cells
          .filter((cell) => cell.sheetId === this.#sheetId)
          .map(({ row, col }) => ({ row, column: col }));
        if (localCells.length > 0) context.runtime.commands.run(PublishSheetDisplayedValueChangesCommand, localCells);
      },
    );
  }

  public apply(pluginState: null, _transaction: Transaction): null {
    return pluginState;
  }

  /** Protects workbook reference integrity until cross-sheet moves own a workbook transaction. */
  public registerRangeMoves(registry: SheetRangeMoveRegistry): void {
    registry.register({
      id: 'workbook.formula.rangeMove.validation',
      validate: (context) => this.#workbookFormula.assertSheetRangeMoveSupported(this.#sheetId, context),
      plan: () => [],
    });
  }

  /** Protects persisted qualified references outside the current Sheet transaction. */
  public registerStructureMoves(registry: SheetStructureMoveRegistry): void {
    registry.register({
      id: 'workbook.formula.structureMove.validation',
      validate: (context) => this.#workbookFormula.assertSheetStructureMoveSupported(this.#sheetId, context),
    });
  }

  public override onTransactionCommitted(transaction: Transaction): void {
    if (transaction.pluginKey !== SheetDataPlugin.pluginKey) return;
    if (!this.#isSheetCommandExecuting?.()) {
      throw new SearContractViolationError('Workbook formula Sheet changes must run through editor.commands.run(...).');
    }
    this.#workbookFormula.observeSheetTransaction(this.#sheetId, transaction);
  }

  public onEditorDestroy(): void {
    this.#unsubscribeStructureResults?.();
    this.#unsubscribeStructureResults = null;
    this.unregisterFormulaResultProvider?.();
    this.unregisterFormulaResultProvider = null;
    this.unregisterFormulaSourceProvider?.();
    this.unregisterFormulaSourceProvider = null;
  }

  public render(_searCore: SearCoreSheet): Node<CellProperties>[] {
    return [];
  }

  public getPluginConfig(_searCore: SearCoreSheet): unknown {
    return {};
  }

  public registerState(): PluginStateRegistration<null> {
    return { key: this.key, state: null, dataEngine: { enabled: false } };
  }
}
