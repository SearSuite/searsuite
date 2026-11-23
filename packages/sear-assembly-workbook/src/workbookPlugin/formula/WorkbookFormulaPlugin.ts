import { type SheetRangeMoveContext, type SheetStructureMoveContext } from '@searsuite/sear-assembly-plugin';
import {
  moveFormulaReferences,
  reorderFormulaReferences,
  type StructureMoveChange,
} from '@searsuite/sear-domain-formula-engine';
import { WorkbookRangeMoveError } from '../../WorkbookRangeMoveError';
import { WorkbookStructureMoveError } from '../../WorkbookStructureMoveError';
import { readWorkbookUpdatedCells } from './readWorkbookUpdatedCells';
import { SearError } from '@searsuite/sear-foundation-error';
import { type SearCoreSheet } from '@searsuite/sear-assembly-core';
import { Plugin, PluginKey } from '@searsuite/sear-assembly-plugin';
import {
  type SheetDocumentState,
  type SheetPlugin,
  type SheetPluginImplementation,
} from '@searsuite/sear-assembly-setup';
import { CellType, type CellMatrixElement } from '@searsuite/sear-domain-cell-types';
import {
  IAggregationCache,
  IFormulaEvaluator,
  IFormulaLocaleProvider,
  IFormulaParser,
  IFormulaTextServiceProvider,
  IFormulaWorkbookMetadataProvider,
  FormulaLanguageServiceDefinition,
  IFunctionRegistry,
  type FormulaValue,
  type FormulaAST,
  FormulaNodeKind,
  StructureChangeAxis,
  StructureChangeKind,
  assertSupportedStructureChange,
  getStructureChangeAxis,
  getStructureChangeKind,
  matrixOperationToStructureChange,
  matrixOperationsToStructureChanges,
  shiftStructureCoordinate,
  type StructureChange,
} from '@searsuite/sear-domain-formula-engine';
import { MatrixOTActionName, type Operation } from '@searsuite/sear-domain-ot';
import {
  createWorkbookCellKey,
  formatParsedWorkbookFormulaReference,
  parseWorkbookCellKey,
  parseWorkbookFormulaReference,
  type WorkbookCellKey,
  type WorkbookCellReference,
  type ParsedWorkbookFormulaReference,
  type WorkbookFormulaReference,
  type WorkbookSheetId,
  type WorkbookDocumentState,
} from '@searsuite/sear-domain-workbook';
import { TRANSACTION_ORIGIN_META_KEY, TransactionOrigin, type Transaction } from '@searsuite/sear-domain-transaction';
import { Injectable, Scope } from '@searsuite/sear-foundation-di';
import {
  AggregationCache,
  FormulaEvaluator,
  FormulaParser,
  FunctionRegistry,
  FormulaTextServiceRegistry,
  createDefaultFormulaLocaleProvider,
} from '@searsuite/sear-domain-formula-engine-ts';
import { type ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { createMountedWorkbookFormulaCompanionSheetPlugin } from '../formulaCompanion/createMountedWorkbookFormulaCompanionSheetPlugin';
import { WorkbookDocumentStateObservation } from '../../WorkbookObservations';
import {
  WorkbookFormulaSheetTransactionObservation,
  WorkbookFormulaStateObservation,
  WorkbookFormulaStructureResultsChangedObservation,
  type WorkbookFormulaSheetTransactionEvent,
  type WorkbookFormulaStateSnapshot,
} from '../../WorkbookFormulaObservations';
import {
  WorkbookFormulaBrokenReferenceReason,
  WorkbookFormulaGraphReferenceKind,
  WorkbookFormulaDependencyGraph,
  createWorkbookFormulaDependencyGraphReader,
  type WorkbookFormulaDependencyGraphReader,
} from '../../WorkbookFormulaDependencyGraph';
import {
  WorkbookPlugin,
  type WorkbookCompanionSheetPluginContext,
  type WorkbookPluginContext,
  type WorkbookPluginServiceContext,
} from '../../WorkbookPluginContracts';
import {
  InvalidateWorkbookFormulaExternalServiceCommand,
  InvalidateWorkbookFormulaFunctionsCommand,
  ProcessCommittedSheetFormulaTransactionCommand,
  RecalculateWorkbookFormulasCommand,
  SynchronizeWorkbookFormulaStateCommand,
  type RecalculateWorkbookFormulasCommandResult,
} from '../../WorkbookFormulaCommands';
import { type CompiledWorkbookFormula, WorkbookFormulaEvaluationRuntime } from '../../WorkbookFormulaEvaluationRuntime';
import { WorkbookFormulaObjectsMetadataKey } from '../../WorkbookFormulaObjects';
import { type WorkbookCommandBus } from '../../WorkbookCommandBus';

/** Workbook-level formula coordinator and cross-sheet dependency owner. */
const StructureEditTokenMeta = 'workbook.formula.structureEditToken';

@Injectable()
export class WorkbookFormulaPlugin extends WorkbookPlugin {
  public static readonly symbol = Symbol.for('WorkbookFormulaPlugin');

  readonly #graph = new WorkbookFormulaDependencyGraph();
  readonly #graphReader = createWorkbookFormulaDependencyGraphReader(this.#graph);
  #formulaRuntime: WorkbookFormulaEvaluationRuntime | null = null;
  #functions: IFunctionRegistry | null = null;
  readonly #formulas = new Map<WorkbookCellKey, CompiledWorkbookFormula>();
  readonly #structureRestores = new Map<string, Map<WorkbookCellKey, {
    before: CompiledWorkbookFormula;
    after: CompiledWorkbookFormula;
  }>>();
  readonly #stateListeners = new Set<(snapshot: WorkbookFormulaStateSnapshot) => void>();
  readonly #sheetTransactionListeners = new Set<(event: WorkbookFormulaSheetTransactionEvent) => void>();
  readonly #structureResultListeners = new Set<(cells: readonly WorkbookCellReference[]) => void>();
  #runtime: WorkbookPluginContext['runtime'] | null = null;
  #workbookState: WorkbookDocumentState<SheetDocumentState> | null = null;
  #initialized = false;
  #observedSheetTransactionCount = 0;
  readonly #pendingSheetTransactions: Array<{ sheetId: WorkbookSheetId; transaction: Transaction }> = [];

  /** Registers one workbook-owned formula runtime shared by mounted Sheet editors. */
  public static registerServices({ container }: WorkbookPluginServiceContext): void {
    if (!container.hasBinding(IFunctionRegistry.symbol)) {
      container.register(IFunctionRegistry.symbol, FunctionRegistry, Scope.Singleton);
    }
    if (!container.hasBinding(IAggregationCache.symbol)) {
      container.register(IAggregationCache.symbol, AggregationCache, Scope.Singleton);
    }
    if (!container.hasBinding(IFormulaParser.symbol)) {
      container.register(IFormulaParser.symbol, FormulaParser, Scope.Singleton);
    }
    if (!container.hasBinding(IFormulaEvaluator.symbol)) {
      container.register(IFormulaEvaluator.symbol, FormulaEvaluator, Scope.Singleton);
    }
    if (!container.hasBinding(IFormulaLocaleProvider.symbol)) {
      container.registerInstance(IFormulaLocaleProvider.symbol, createDefaultFormulaLocaleProvider());
    }
    if (!container.hasBinding(IFormulaTextServiceProvider.symbol)) {
      container.registerInstance(IFormulaTextServiceProvider.symbol, new FormulaTextServiceRegistry());
    }
  }

  /** Shares the workbook function registry with each mounted Sheet editor. */
  public getSheetServices(context: WorkbookCompanionSheetPluginContext): readonly { token: symbol; value: unknown }[] {
    this.#functions ??= context.container.resolve<IFunctionRegistry>(IFunctionRegistry.symbol);
    return [
      { token: IFunctionRegistry.symbol, value: this.#functions },
      {
        token: IFormulaWorkbookMetadataProvider.symbol,
        value: {
          readWorkbook: () => {
            const sheets = context.runtime.document.getState().sheets;
            const currentSheet = sheets.find((sheet) => sheet.id === context.sheetId);
            return {
              ...(currentSheet === undefined
                ? {}
                : { currentSheetId: currentSheet.id, currentSheetName: currentSheet.name }),
              sheets: sheets.map((sheet, index) => ({
                id: sheet.id,
                name: sheet.name,
                index: index + 1,
                visible: !sheet.hidden,
              })),
            };
          },
        } satisfies IFormulaWorkbookMetadataProvider,
      },
      {
        token: IFormulaLocaleProvider.symbol,
        value: context.container.resolve<IFormulaLocaleProvider>(IFormulaLocaleProvider.symbol),
      },
      {
        token: IFormulaTextServiceProvider.symbol,
        value: context.container.resolve<IFormulaTextServiceProvider>(IFormulaTextServiceProvider.symbol),
      },
    ];
  }

  /** Registers workbook formula commands. */
  public registerCommands(commands: WorkbookCommandBus): void {
    commands.register(RecalculateWorkbookFormulasCommand, () => this.recalculateDirtyFormulas());
    commands.register(SynchronizeWorkbookFormulaStateCommand, () => {
      this.#observeWorkbookState(this.#requireRuntime().document.getState());
    });
    commands.register(ProcessCommittedSheetFormulaTransactionCommand, () => {
      const pending = this.#pendingSheetTransactions.at(-1);
      if (!pending) throw new SearError('No committed Sheet transaction is pending.');
      this.#processSheetTransaction(pending.sheetId, pending.transaction);
    });
    commands.register(InvalidateWorkbookFormulaExternalServiceCommand, (serviceId) =>
      this.#invalidateExternalService(serviceId));
    commands.register(InvalidateWorkbookFormulaFunctionsCommand, (names) => this.#invalidateFunctions(names));
  }

  /** Registers workbook formula diagnostic observations. */
  public registerObservations(observations: ObservationRegistry): void {
    observations.register(WorkbookFormulaStateObservation, {
      getSnapshot: () => this.#createStateSnapshot(),
      subscribe: (listener) => this.#subscribe(this.#stateListeners, listener),
    });
    observations.register(WorkbookFormulaSheetTransactionObservation, {
      subscribe: (listener) => this.#subscribe(this.#sheetTransactionListeners, listener),
    });
    observations.register(WorkbookFormulaStructureResultsChangedObservation, {
      subscribe: (listener) => this.#subscribe(this.#structureResultListeners, listener),
    });
  }

  /** Contributes the active-sheet companion that forwards committed Sheet transactions. */
  public getSheetPlugins(
    context: WorkbookCompanionSheetPluginContext,
  ): readonly SheetPluginImplementation<SheetPlugin<unknown>>[] {
    return [createMountedWorkbookFormulaCompanionSheetPlugin(this, context.sheetId, context.runtime.observations)];
  }

  /** Starts observing workbook state for this WorkbookEditor instance. */
  public initialize(context: WorkbookPluginContext): () => void {
    if (this.#initialized) throw new SearError('Workbook formula plugin is already initialized.');
    this.#initialized = true;
    this.#runtime = context.runtime;
    this.#functions = context.container.resolve<IFunctionRegistry>(IFunctionRegistry.symbol);
    const localeProvider = context.container.resolve<IFormulaLocaleProvider>(IFormulaLocaleProvider.symbol);
    const textServiceProvider = context.container.resolve<IFormulaTextServiceProvider>(
      IFormulaTextServiceProvider.symbol,
    );
    this.#formulaRuntime = new WorkbookFormulaEvaluationRuntime({
      parser: context.container.resolve<IFormulaParser>(IFormulaParser.symbol),
      evaluator: context.container.resolve<IFormulaEvaluator>(IFormulaEvaluator.symbol),
      contextServices: () => {
        const dateTimeLocale = localeProvider.getDateTimeLocale();
        const textLocale = localeProvider.getTextLocale?.();
        const phoneticReader = textServiceProvider.getPhoneticReader?.();
        const languageService = textServiceProvider.getLanguageService?.();
        return {
          xmlXPath: context.runtime.formula.xmlXPath,
          externalServices: context.runtime.formula.externalServices,
          ...(dateTimeLocale ? { dateTimeLocale } : {}),
          ...(textLocale ? { textLocale } : {}),
          ...(phoneticReader ? { phoneticReader } : {}),
          ...(languageService ? { languageService } : {}),
        };
      },
    });
    const disposers = [
      context.runtime.observations.subscribe(WorkbookDocumentStateObservation, () => {
        context.runtime.commands.run(SynchronizeWorkbookFormulaStateCommand, void 0);
      }),
    ];
    const invalidateLanguage = () =>
      context.runtime.commands.run(InvalidateWorkbookFormulaExternalServiceCommand, FormulaLanguageServiceDefinition.id);
    const disposeLanguage =
      textServiceProvider.subscribeInvalidation?.(invalidateLanguage) ??
      textServiceProvider.getLanguageService?.()?.subscribeInvalidation?.(invalidateLanguage);
    if (disposeLanguage) disposers.push(disposeLanguage);
    disposers.push(
      context.runtime.formula.externalServices.subscribeInvalidation((ids) => {
        ids.forEach((id) => context.runtime.commands.run(InvalidateWorkbookFormulaExternalServiceCommand, id));
      }),
    );
    disposers.push(this.#functions.subscribe((names) =>
      context.runtime.commands.run(InvalidateWorkbookFormulaFunctionsCommand, names)));
    context.runtime.commands.run(RecalculateWorkbookFormulasCommand, void 0);
    return () => disposers.reverse().forEach((dispose) => dispose());
  }

  /** Returns the workbook-qualified dependency graph owned by this plugin instance. */
  public getDependencyGraph(): WorkbookFormulaDependencyGraphReader {
    return this.#graphReader;
  }

  /** Parses a displayed cross-sheet reference against the latest workbook sheet names. */
  public parseReference(reference: string): ParsedWorkbookFormulaReference {
    return parseWorkbookFormulaReference(reference, this.#requireWorkbookState().sheets);
  }

  /** Formats a stable workbook reference with the latest workbook sheet name. */
  public formatReference(reference: ParsedWorkbookFormulaReference): string {
    return formatParsedWorkbookFormulaReference(reference, this.#requireWorkbookState().sheets);
  }

  /** Registers workbook-qualified dependencies for one formula cell. */
  public updateFormulaCell(
    formulaCell: ParsedWorkbookFormulaReference,
    dependencies: readonly WorkbookFormulaReference[],
  ): void {
    this.#assertWorkbookCommandWrite();
    const [row, col] = formulaCell.range.start;
    const workbookFormulaCell = { sheetId: formulaCell.sheetId, row, col };
    this.#graph.updateFormulaCell(workbookFormulaCell, dependencies);
    this.#emitState();
  }

  /** Registers and compiles one workbook formula source. */
  public setFormulaCellFormula(formulaCell: ParsedWorkbookFormulaReference, formulaSource: string): void {
    this.#assertWorkbookCommandWrite();
    const workbookState = this.#requireWorkbookState();
    const [row, col] = formulaCell.range.start;
    const workbookFormulaCell = { sheetId: formulaCell.sheetId, row, col };
    this.#registerFormulaSource(workbookFormulaCell, formulaSource, workbookState);
    this.#emitState();
  }

  /** Removes workbook formula bookkeeping for one formula cell. */
  public removeFormulaCell(formulaCell: WorkbookCellReference): void {
    this.#assertWorkbookCommandWrite();
    this.#formulas.delete(createWorkbookCellKey(formulaCell));
    this.#graph.removeFormulaCell(formulaCell);
    this.#emitState();
  }

  /** Returns a workbook-level formula result when the skeleton can determine one. */
  public getFormulaResult(formulaCell: ParsedWorkbookFormulaReference): FormulaValue | undefined {
    const [row, col] = formulaCell.range.start;
    return this.#graph.getFormulaResult({ sheetId: formulaCell.sheetId, row, col });
  }

  /** Returns a result only for formula cells that contain workbook-qualified references. */
  public getSheetFormulaResult(sheetId: WorkbookSheetId, row: number, col: number): FormulaValue | undefined {
    const formulaCell = { sheetId, row, col };
    const formulaKey = createWorkbookCellKey(formulaCell);
    const compiled = this.#formulas.get(formulaKey);
    if (!compiled?.hasWorkbookReferences) return void 0;
    if (this.#graph.isDirty(formulaCell)) this.#requireRuntime().commands.run(RecalculateWorkbookFormulasCommand, void 0);
    return this.#graph.getFormulaResult(formulaCell);
  }

  /** Returns display-ready formula source for workbook formulas on one mounted sheet. */
  public getSheetFormulaSource(sheetId: WorkbookSheetId, row: number, col: number): string | undefined {
    const compiled = this.#formulas.get(createWorkbookCellKey({ sheetId, row, col }));
    if (!compiled?.hasWorkbookReferences) return void 0;
    return this.#requireFormulaRuntime().formatFormulaSource(compiled, this.#requireWorkbookState());
  }

  /** Rejects moves requiring reference edits outside the current Sheet transaction boundary. */
  public assertSheetRangeMoveSupported(sheetId: WorkbookSheetId, context: SheetRangeMoveContext): void {
    if (context.source.start.every((value, axis) => value === context.destination.start[axis])) return;
    for (const compiled of this.#formulas.values()) {
      for (const [sheetName, boundSheetId] of compiled.sheetBindings) {
        if (boundSheetId !== sheetId) continue;
        const rewritten = moveFormulaReferences(compiled.ast, {
          start: context.source.start,
          end: context.source.end,
          rowOffset: context.destination.start[0] - context.source.start[0],
          columnOffset: context.destination.start[1] - context.source.start[1],
          sheetName,
          includeUnqualified: false,
        });
        if (rewritten !== compiled.ast) throw new WorkbookRangeMoveError(sheetId);
      }
    }
  }

  /** Rejects qualified reference rewrites that cannot be persisted by a single Sheet transaction. */
  public assertSheetStructureMoveSupported(sheetId: WorkbookSheetId, context: SheetStructureMoveContext): void {
    const changes = matrixOperationsToStructureChanges(context.operations as Operation[]).filter(
      (change): change is StructureMoveChange => 'fromIndex' in change,
    );
    for (const compiled of this.#formulas.values()) {
      for (const [sheetName, boundSheetId] of compiled.sheetBindings) {
        if (boundSheetId !== sheetId) continue;
        if (reorderFormulaReferences(compiled.ast, changes, { sheetName, includeUnqualified: false }) !== compiled.ast)
          throw new WorkbookStructureMoveError(sheetId);
      }
    }
  }

  /** Stores a derived workbook formula result and marks the formula clean. */
  public setFormulaResult(formulaCell: ParsedWorkbookFormulaReference, result: FormulaValue): void {
    this.#assertWorkbookCommandWrite();
    const [row, col] = formulaCell.range.start;
    this.#graph.setFormulaResult({ sheetId: formulaCell.sheetId, row, col }, result);
    this.#emitState();
  }

  /** Recalculates workbook formulas currently marked dirty. */
  public recalculateDirtyFormulas(): RecalculateWorkbookFormulasCommandResult {
    this.#assertWorkbookCommandWrite();
    const result = this.#requireFormulaRuntime().recalculateDirty({
      graph: this.#graph,
      runtime: this.#requireRuntime(),
      formulas: this.#formulas,
    });
    this.#emitState();
    return result;
  }

  /** Receives a committed Sheet transaction from the active SheetEditor companion. */
  public observeSheetTransaction(sheetId: WorkbookSheetId, transaction: Transaction): void {
    const sheets = this.#requireRuntime().sheets;
    if (sheets.getActiveId() !== sheetId || !sheets.getActiveEditor().commands.isExecuting()) {
      throw new SearError('Workbook formula Sheet changes must run through the active Sheet command.');
    }
    this.#pendingSheetTransactions.push({ sheetId, transaction });
    try {
      this.#requireRuntime().commands.run(ProcessCommittedSheetFormulaTransactionCommand, void 0);
    } finally {
      this.#pendingSheetTransactions.pop();
    }
  }

  #processSheetTransaction(sheetId: WorkbookSheetId, transaction: Transaction): void {
    this.#assertWorkbookCommandWrite();
    this.#observedSheetTransactionCount += 1;
    const structureChanges = matrixOperationsToStructureChanges(transaction.operations);
    structureChanges.forEach(assertSupportedStructureChange);
    const token = transaction.getMeta<string>(StructureEditTokenMeta);
    const origin = transaction.getMeta<TransactionOrigin>(TRANSACTION_ORIGIN_META_KEY);
    const isHistory = origin === TransactionOrigin.History;
    const isDelete = structureChanges.some((change) => getStructureChangeKind(change) === StructureChangeKind.Delete);
    const isInsert = structureChanges.some((change) => getStructureChangeKind(change) === StructureChangeKind.Insert);
    const beforeDelete = !token && origin !== TransactionOrigin.Remote && !isHistory && isDelete
      ? new Map(this.#formulas) : null;
    const restore = token && isHistory && isInsert ? this.#structureRestores.get(token) : undefined;
    const beforeUndo = restore ? new Map(this.#formulas) : null;
    const redoRestore = token && isHistory && isDelete ? this.#structureRestores.get(token) : undefined;
    const beforeRedo = redoRestore ? new Map(this.#formulas) : null;
    if (beforeDelete) transaction.setMeta(StructureEditTokenMeta, `${sheetId}:${this.#observedSheetTransactionCount}`);
    if (structureChanges.length > 0) this.#applyStructureChanges(sheetId, structureChanges);
    const changedCells = readChangedCells(sheetId, transaction.operations);
    this.#graph.markDirty(changedCells);
    this.#updateCommittedFormulaCells(sheetId, transaction.operations);
    this.#indexInsertedFormulaCells(sheetId, transaction.operations);
    if (beforeDelete) this.#recordCrossSheetStructureRestore(sheetId, transaction, beforeDelete);
    if (restore && beforeUndo) this.#restoreCrossSheetFormulas(restore, beforeUndo);
    if (redoRestore && beforeRedo) this.#refreshCrossSheetRestoreAfterRedo(redoRestore, beforeRedo);
    this.recalculateDirtyFormulas();
    const event = { sheetId, transaction };
    this.#sheetTransactionListeners.forEach((listener) => listener(event));
    this.#emitState();
  }

  #recordCrossSheetStructureRestore(
    changedSheetId: WorkbookSheetId,
    transaction: Transaction,
    beforeDelete: ReadonlyMap<WorkbookCellKey, CompiledWorkbookFormula>,
  ): void {
    const token = transaction.getMeta<string>(StructureEditTokenMeta);
    if (!token) return;
    const entries = new Map<WorkbookCellKey, { before: CompiledWorkbookFormula; after: CompiledWorkbookFormula }>();
    beforeDelete.forEach((before, key) => {
      if (parseWorkbookCellKey(key).sheetId === changedSheetId) return;
      const after = this.#formulas.get(key);
      if (after && after !== before) entries.set(key, { before, after });
    });
    if (entries.size === 0) return;
    this.#structureRestores.set(token, entries);
    if (this.#structureRestores.size > 100) this.#structureRestores.delete(this.#structureRestores.keys().next().value!);
  }

  #restoreCrossSheetFormulas(
    restore: ReadonlyMap<WorkbookCellKey, { before: CompiledWorkbookFormula; after: CompiledWorkbookFormula }>,
    beforeUndo: ReadonlyMap<WorkbookCellKey, CompiledWorkbookFormula>,
  ): void {
    let changed = false;
    restore.forEach(({ before, after }, key) => {
      if (beforeUndo.get(key) !== after || !this.#formulas.has(key)) return;
      this.#formulas.set(key, before);
      changed = true;
    });
    if (changed) this.#rebuildGraphFromCompiledFormulas();
  }

  #refreshCrossSheetRestoreAfterRedo(
    restore: Map<WorkbookCellKey, { before: CompiledWorkbookFormula; after: CompiledWorkbookFormula }>,
    beforeRedo: ReadonlyMap<WorkbookCellKey, CompiledWorkbookFormula>,
  ): void {
    restore.forEach((entry, key) => {
      const after = this.#formulas.get(key);
      if (beforeRedo.get(key) === entry.before && after) restore.set(key, { before: entry.before, after });
    });
  }

  #updateCommittedFormulaCells(sheetId: WorkbookSheetId, operations: readonly Operation[]): void {
    for (const update of readWorkbookUpdatedCells(sheetId, operations)) {
      if (isFormulaCell(update.cell)) {
        this.setFormulaCellFormula(toParsedFormulaCell(update.reference), update.cell.formula);
      } else if (this.#graph.hasFormulaCell(update.reference)) {
        this.removeFormulaCell(update.reference);
      }
    }
  }

  #indexInsertedFormulaCells(sheetId: WorkbookSheetId, operations: readonly Operation[]): void {
    for (const inserted of readInsertedFormulaCells(sheetId, operations)) {
      this.setFormulaCellFormula(toParsedFormulaCell(inserted.reference), inserted.cell.formula);
    }
  }

  #observeWorkbookState(state: WorkbookDocumentState<SheetDocumentState>): void {
    const objectsChanged = this.#workbookState !== null &&
      this.#workbookState.metadata?.[WorkbookFormulaObjectsMetadataKey] !== state.metadata?.[WorkbookFormulaObjectsMetadataKey];
    const previousSheetIds = new Set(this.#workbookState?.sheets.map((sheet) => sheet.id) ?? []);
    const nextSheetIds = new Set(state.sheets.map((sheet) => sheet.id));
    const sheetListChanged = previousSheetIds.size !== nextSheetIds.size ||
      [...previousSheetIds].some((sheetId) => !nextSheetIds.has(sheetId));
    const changedFormulaCells = new Map<WorkbookCellKey, WorkbookCellReference>();
    const restoredSheetIds = new Set([...nextSheetIds].filter((sheetId) => !previousSheetIds.has(sheetId)));
    previousSheetIds.forEach((sheetId) => {
      if (nextSheetIds.has(sheetId)) return;
      this.#removeFormulaSourcesForSheet(sheetId);
      this.#markFormulaReferencesToDeletedSheet(sheetId).forEach((cell) =>
        changedFormulaCells.set(createWorkbookCellKey(cell), cell));
      this.#graph.removeSheet(sheetId);
    });
    this.#workbookState = state;
    this.#restoreFormulaReferencesForSheets(restoredSheetIds).forEach((cell) =>
      changedFormulaCells.set(createWorkbookCellKey(cell), cell));
    this.#syncFormulaSourcesFromState(state);
    if (objectsChanged) {
      for (const [key, compiled] of this.#formulas) {
        this.#registerFormulaSource(parseWorkbookCellKey(key), compiled.source, state);
      }
    }
    const recalculation = this.#runtime?.commands.run(RecalculateWorkbookFormulasCommand, void 0);
    if (sheetListChanged) {
      recalculation?.recalculatedCells.forEach((cell) =>
        changedFormulaCells.set(createWorkbookCellKey(cell), cell));
      if (changedFormulaCells.size > 0) {
        const cells = [...changedFormulaCells.values()];
        this.#structureResultListeners.forEach((listener) => listener(cells));
      }
    }
    this.#emitState();
  }

  #registerFormulaSource(
    formulaCell: WorkbookCellReference,
    formulaSource: string,
    workbookState: WorkbookDocumentState<SheetDocumentState>,
  ): void {
    const compiled = this.#requireFormulaRuntime().compileFormula(formulaCell, formulaSource, workbookState);
    this.#formulas.set(createWorkbookCellKey(formulaCell), compiled);
    this.#graph.updateFormulaCellReferences(formulaCell, [...compiled.dependencies, ...compiled.brokenReferences]);
  }

  #applyStructureChanges(sheetId: WorkbookSheetId, changes: readonly StructureChange[]): void {
    const rebasedFormulas = new Map<WorkbookCellKey, CompiledWorkbookFormula>();
    for (const [formulaKey, compiled] of this.#formulas) {
      const formulaCell = parseWorkbookCellKey(formulaKey);
      const rebasedFormulaCell =
        formulaCell.sheetId === sheetId ? shiftWorkbookFormulaCell(formulaCell, changes) : formulaCell;
      if (!rebasedFormulaCell) continue;
      const shifted = this.#requireFormulaRuntime().shiftCompiledFormulaReferences({
        formulaCell: rebasedFormulaCell,
        compiled,
        changedSheetId: sheetId,
        changes,
      });
      rebasedFormulas.set(createWorkbookCellKey(rebasedFormulaCell), shifted.compiled);
    }
    this.#formulas.clear();
    rebasedFormulas.forEach((compiled, key) => this.#formulas.set(key, compiled));
    this.#rebuildGraphFromCompiledFormulas();
  }

  #rebuildGraphFromCompiledFormulas(): void {
    this.#graph.clear();
    this.#formulas.forEach((compiled, formulaKey) => {
      this.#graph.updateFormulaCellReferences(parseWorkbookCellKey(formulaKey), [
        ...compiled.dependencies,
        ...compiled.brokenReferences,
      ]);
    });
  }

  #syncFormulaSourcesFromState(state: WorkbookDocumentState<SheetDocumentState>): void {
    const seenFormulaKeys = new Set<WorkbookCellKey>();
    for (const sheet of state.sheets) {
      const sheetState = state.sheetStates[sheet.id];
      sheetState?.sheetData.forEachStored((cell, row, col) => {
        const reference = { sheetId: sheet.id, row, col };
        const key = createWorkbookCellKey(reference);
        if (!isFormulaCell(cell)) return;
        seenFormulaKeys.add(key);
        if (!this.#formulas.has(key)) this.#registerFormulaSource(reference, cell.formula, state);
      });
    }
    for (const formulaKey of [...this.#formulas.keys()]) {
      if (!nextWorkbookStateHasSheet(state, parseWorkbookCellKey(formulaKey).sheetId)) continue;
      if (seenFormulaKeys.has(formulaKey)) continue;
      this.removeFormulaCell(parseWorkbookCellKey(formulaKey));
    }
  }

  #createStateSnapshot(): WorkbookFormulaStateSnapshot {
    return {
      workbookId: this.#workbookState?.id ?? null,
      activeSheetId: this.#runtime?.sheets.getActiveId() ?? null,
      sheetIds: this.#workbookState?.sheets.map((sheet) => sheet.id) ?? [],
      formulaCellCount: this.#graph.size,
      dirtyFormulaCellCount: this.#graph.dirtySize,
      cachedFormulaResultCount: this.#graph.resultSize,
      observedSheetTransactionCount: this.#observedSheetTransactionCount,
    };
  }

  #emitState(): void {
    const snapshot = this.#createStateSnapshot();
    this.#stateListeners.forEach((listener) => listener(snapshot));
  }

  #requireWorkbookState(): WorkbookDocumentState<SheetDocumentState> {
    if (this.#workbookState) return this.#workbookState;
    throw new SearError('WorkbookFormulaPlugin has not observed a workbook state yet.');
  }

  #requireRuntime(): WorkbookPluginContext['runtime'] {
    if (this.#runtime) return this.#runtime;
    throw new SearError('WorkbookFormulaPlugin has not been initialized.');
  }

  #assertWorkbookCommandWrite(): void {
    if (!this.#requireRuntime().commands.isExecuting()) {
      throw new SearError('Workbook formula state must change through editor.commands.run(...).');
    }
  }

  #requireFormulaRuntime(): WorkbookFormulaEvaluationRuntime {
    if (this.#formulaRuntime) return this.#formulaRuntime;
    throw new SearError('WorkbookFormulaPlugin has not been initialized.');
  }

  #removeFormulaSourcesForSheet(sheetId: WorkbookSheetId): void {
    for (const formulaKey of [...this.#formulas.keys()]) {
      if (parseWorkbookCellKey(formulaKey).sheetId === sheetId) this.#formulas.delete(formulaKey);
    }
  }

  #markFormulaReferencesToDeletedSheet(sheetId: WorkbookSheetId): WorkbookCellReference[] {
    const changed: WorkbookCellReference[] = [];
    this.#formulas.forEach((compiled, formulaKey) => {
      const referencesToDeletedSheet = compiled.dependencies.filter((dependency) => dependency.sheetId === sheetId);
      if (referencesToDeletedSheet.length === 0) return;
      changed.push(parseWorkbookCellKey(formulaKey));
      this.#formulas.set(formulaKey, {
        ...compiled,
        dependencies: compiled.dependencies.filter((dependency) => dependency.sheetId !== sheetId),
        brokenReferences: [
          ...compiled.brokenReferences,
          ...referencesToDeletedSheet.map((reference) => ({
            kind: WorkbookFormulaGraphReferenceKind.Broken,
            reason: WorkbookFormulaBrokenReferenceReason.SheetDeleted,
            sheetId,
            reference,
          })),
        ],
      });
    });
    return changed;
  }

  #restoreFormulaReferencesForSheets(sheetIds: ReadonlySet<WorkbookSheetId>): WorkbookCellReference[] {
    if (sheetIds.size === 0) return [];
    let changed = false;
    const changedCells: WorkbookCellReference[] = [];
    this.#formulas.forEach((compiled, formulaKey) => {
      const restored = compiled.brokenReferences.filter(
        (reference) =>
          reference.reason === WorkbookFormulaBrokenReferenceReason.SheetDeleted && sheetIds.has(reference.sheetId),
      );
      if (restored.length === 0) return;
      changed = true;
      changedCells.push(parseWorkbookCellKey(formulaKey));
      this.#formulas.set(formulaKey, {
        ...compiled,
        dependencies: [...compiled.dependencies, ...restored.map((reference) => reference.reference)],
        brokenReferences: compiled.brokenReferences.filter((reference) => !restored.includes(reference)),
      });
    });
    if (changed) this.#rebuildGraphFromCompiledFormulas();
    return changedCells;
  }

  #subscribe<Value>(listeners: Set<(value: Value) => void>, listener: (value: Value) => void): () => void {
    listeners.add(listener);
    return function disposeWorkbookFormulaSubscription(): void {
      listeners.delete(listener);
    };
  }

  #invalidateExternalService(service: string): void {
    const affected = [...this.#formulas.entries()]
      .filter(([, compiled]) => this.#containsExternalServiceCall(compiled.ast, service))
      .map(([key]) => parseWorkbookCellKey(key));
    if (affected.length === 0) return;
    this.#graph.markFormulaCellsDirty(affected);
    this.recalculateDirtyFormulas();
  }

  #invalidateFunctions(functionNames: readonly string[]): void {
    const names = new Set(functionNames.map((name) => name.toUpperCase()));
    const affected = [...this.#formulas.entries()]
      .filter(([, compiled]) => this.#containsFunctionCall(compiled.ast, names))
      .map(([key]) => parseWorkbookCellKey(key));
    if (affected.length === 0) return;
    this.#graph.markFormulaCellsDirty(affected);
    this.recalculateDirtyFormulas();
  }

  #containsFunctionCall(ast: FormulaAST, names: ReadonlySet<string>): boolean {
    switch (ast.kind) {
      case FormulaNodeKind.Call:
        return (
          names.has(ast.name.toUpperCase()) || ast.args.some((argument) => this.#containsFunctionCall(argument, names))
        );
      case FormulaNodeKind.Invoke:
        return (
          this.#containsFunctionCall(ast.callee, names) ||
          ast.args.some((argument) => this.#containsFunctionCall(argument, names))
        );
      case FormulaNodeKind.Array:
        return ast.rows.some((row) => row.some((value) => this.#containsFunctionCall(value, names)));
      case FormulaNodeKind.Tuple:
        return ast.items.some((value) => this.#containsFunctionCall(value, names));
      case FormulaNodeKind.Binary:
      case FormulaNodeKind.Intersection:
        return this.#containsFunctionCall(ast.left, names) || this.#containsFunctionCall(ast.right, names);
      case FormulaNodeKind.Unary:
        return this.#containsFunctionCall(ast.operand, names);
      default:
        return false;
    }
  }

  #containsExternalServiceCall(ast: FormulaAST, service: string): boolean {
    switch (ast.kind) {
      case FormulaNodeKind.Call:
        return (
          Boolean(this.#functions?.get(ast.name)?.descriptor?.externalServices?.includes(service)) ||
          ast.args.some((argument) => this.#containsExternalServiceCall(argument, service))
        );
      case FormulaNodeKind.Invoke:
        return (
          this.#containsExternalServiceCall(ast.callee, service) ||
          ast.args.some((argument) => this.#containsExternalServiceCall(argument, service))
        );
      case FormulaNodeKind.Array:
        return ast.rows.some((row) => row.some((value) => this.#containsExternalServiceCall(value, service)));
      case FormulaNodeKind.Tuple:
        return ast.items.some((value) => this.#containsExternalServiceCall(value, service));
      case FormulaNodeKind.Binary:
      case FormulaNodeKind.Intersection:
        return (
          this.#containsExternalServiceCall(ast.left, service) || this.#containsExternalServiceCall(ast.right, service)
        );
      case FormulaNodeKind.Unary:
        return this.#containsExternalServiceCall(ast.operand, service);
      default:
        return false;
    }
  }
}

function readChangedCells(
  sheetId: WorkbookSheetId,
  operations: readonly Operation[],
): Array<{ sheetId: WorkbookSheetId; row: number; col: number }> {
  const changedCells: Array<{ sheetId: WorkbookSheetId; row: number; col: number }> = [];
  operations.filter(isUpdateCellOperation).forEach((operation) => {
    const row = operation.p[0];
    const col = operation.p[1];
    if (Number.isInteger(row) && Number.isInteger(col)) changedCells.push({ sheetId, row, col });
  });
  return changedCells;
}

function isUpdateCellOperation(operation: Operation): operation is Operation & { p: [number, number] } {
  return (
    MatrixOTActionName.UpdateCell in operation &&
    Array.isArray(operation.p) &&
    typeof operation.p[0] === 'number' &&
    typeof operation.p[1] === 'number'
  );
}

function shiftWorkbookFormulaCell(
  formulaCell: WorkbookCellReference,
  changes: readonly StructureChange[],
): WorkbookCellReference | null {
  const row = shiftStructureCoordinate({ coordinate: formulaCell.row, axis: StructureChangeAxis.Row, changes });
  const col = shiftStructureCoordinate({ coordinate: formulaCell.col, axis: StructureChangeAxis.Col, changes });
  if (row.deleted || col.deleted) return null;
  return { ...formulaCell, row: row.value, col: col.value };
}

function readInsertedFormulaCells(
  sheetId: WorkbookSheetId,
  operations: readonly Operation[],
): Array<{
  reference: WorkbookCellReference;
  cell: CellMatrixElement & { type: typeof CellType.Formula; formula: string };
}> {
  const inserted: Array<{
    reference: WorkbookCellReference;
    cell: CellMatrixElement & { type: typeof CellType.Formula; formula: string };
  }> = [];
  for (const operation of operations) {
    const change = matrixOperationToStructureChange(operation);
    if (!change || getStructureChangeKind(change) !== StructureChangeKind.Insert) continue;
    if (!('index' in change)) continue;
    const cells = Reflect.get(operation, change.type) as Array<CellMatrixElement | null> | undefined;
    if (!Array.isArray(cells)) continue;
    const axis = getStructureChangeAxis(change);
    cells.forEach((cell, offset) => {
      if (!isFormulaCell(cell)) return;
      const reference =
        axis === StructureChangeAxis.Row
          ? { sheetId, row: change.index, col: offset }
          : { sheetId, row: offset, col: change.index };
      inserted.push({ reference, cell });
    });
  }
  return inserted;
}

function isFormulaCell(cell: CellMatrixElement | null): cell is CellMatrixElement & {
  type: typeof CellType.Formula;
  formula: string;
} {
  return cell?.type === CellType.Formula && typeof cell.formula === 'string' && cell.formula.startsWith('=');
}

function toParsedFormulaCell(reference: WorkbookCellReference): ParsedWorkbookFormulaReference {
  return {
    sheetId: reference.sheetId,
    range: {
      sheetId: reference.sheetId,
      start: [reference.row, reference.col],
      end: [reference.row, reference.col],
    },
  };
}

function nextWorkbookStateHasSheet(
  state: WorkbookDocumentState<SheetDocumentState>,
  sheetId: WorkbookSheetId,
): boolean {
  return state.sheets.some((sheet) => sheet.id === sheetId);
}
