/**
 * Formula plugin main entry.
 *
 * Responsibilities:
 * 1. Listen to OT operations (UpdateCell, RowInsert, RowDelete, ColInsert, ColDelete).
 * 2. Parse formulas and register dependencies with DependencyGraph.
 * 3. Trigger lazy recalculation through RecalcScheduler.
 *
 * Uses DI-injected interfaces and does not depend on concrete implementations.
 * Implementations can be replaced with WASM versions without modifying this file.
 *
 * RecalcScheduler writes evaluation results directly to the DI-injected
 * FormulaResultStore. The plugin maintains its derived AST cache after commit;
 * rendering reads calculated results
 * through IFormulaResultProvider.
 */

import { Injectable, Inject } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';
import { CellType, SheetCellInputValidationRegistry } from '@searsuite/sear-domain-cell-types';
import { SearCoreSheet, CellMatrixElement } from '@searsuite/sear-assembly-core';
import { type SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { type ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { Plugin, PluginKey } from '@searsuite/sear-assembly-plugin';
import { ConfigUnit } from '@searsuite/sear-assembly-config';
import { type OTOperation, MatrixOTActionName, type UpdateCellOTOperation } from '@searsuite/sear-domain-ot';
import { Transaction } from '@searsuite/sear-domain-transaction';
import { CellProperties, CellRegion } from '@searsuite/sear-render-registry';
import { type EventWithOffsetAndTarget } from '@searsuite/sear-render-event-engine';
import { Node } from '@searsuite/sear-render-node';
import {
  type CellKey,
  type Dependency,
  type FormulaAST,
  type FormulaCellStatus,
  type FormulaError,
  type FormulaRichResult,
  type FormulaValue,
  FormulaHyperlinkServiceDefinition,
  FormulaNodeKind,
  type StructureChange,
  StructureChangeAxis,
  StructureChangeKind,
  assertSupportedStructureChange,
  FormulaStructureChangeActionNames,
  FormulaDependenciesChangedEventType,
  getStructureChangeAxis,
  getStructureChangeKind,
  IFormulaResultProvider,
  IFormulaRichResultProvider,
  IFormulaSourceProvider,
  IFormulaStatusProvider,
  IFormulaParser,
  IDependencyGraph,
  IAggregationCache,
  IFunctionRegistry,
  IFormulaExternalServiceProvider,
  IFormulaTextServiceProvider,
  isFormulaErrorCode,
  matrixOperationToStructureChange,
  shiftStructureCoordinate,
} from '@searsuite/sear-domain-formula-engine';
import {
  AggregationCache, DependencyGraph, FormulaExternalServiceRegistry,
  FormulaTextServiceRegistry, FunctionRegistry, cellKey, fromCellKey,
} from '@searsuite/sear-domain-formula-engine-ts';
import { DataEngine, readSheetDataMatrix, SheetDataPlugin } from '@searsuite/sear-render-engine';
import { RecalcScheduler } from '../RecalcScheduler';
import { FormulaRefShifter } from '../FormulaRefShifter';
import { FormulaResultStore } from '../FormulaResultStore';
import { FormulaSchedulerDataSource } from '../FormulaSchedulerDataSource';
import { FormulaCalculationTraceBus } from '../FormulaCalculationTraceBus';
import { formulaReferenceHighlightConfig, sheetFormulaPluginKey } from '../FormulaHighlightConfig';
import { registerFormulaStatusCommands } from '../FormulaStatusCommands';
import { FormulaCalculationTraceObservation } from '../FormulaObservations';
import { FormulaResultProviderRegistry } from '../FormulaResultProviderRegistry';
import { FormulaRichResultProviderRegistry } from '../FormulaRichResultProviderRegistry';
import { FormulaSourceProviderRegistry } from '../FormulaSourceProviderRegistry';
import { registerFormulaProviderCommands, sealFormulaProviderRegistries } from '../FormulaProviderCommands';
import { registerFormulaRecalculationCommands } from '../FormulaRecalculationCommands';
import { registerSheetFormulaFunctionCommands, UnregisterSheetFormulaFunctionCommand } from '../FormulaFunctionRegistrationCommands';
import {
  registerSheetFormulaServiceCommands,
  UnregisterSheetFormulaExternalServiceCommand,
  UnregisterSheetFormulaTextServiceCommand,
} from '../FormulaServiceRegistrationCommands';
import { type FormulaRegistryOwnership } from '../FormulaRegistryOwnership';
import { SearError } from '@searsuite/sear-foundation-error';

/** Formula owns no document state; its ASTs and results are derived caches. */
export type FormulaPluginState = null;

const pluginKey = sheetFormulaPluginKey;

/**
 * Connects committed formula cells to dependency tracking and recalculation.
 *
 * Formula source stays in cell document state. This plugin parses that source,
 * updates its dependency graph after commits, schedules recalculation, and
 * publishes calculated values and status through provider contracts. Its ASTs
 * and results are derived caches rather than a second document state.
 */
@Injectable()
export class SheetFormulaPlugin
  extends Plugin<SearCoreSheet, CellProperties, FormulaPluginState>
  implements IFormulaResultProvider, IFormulaRichResultProvider, IFormulaSourceProvider, IFormulaStatusProvider
{
  /** DI token for resolving SheetFormulaPlugin. */
  public static readonly symbol = Symbol.for('SheetFormulaPlugin');
  /** Stable plugin key for SheetFormulaPlugin. */
  public static readonly pluginKey = pluginKey;

  /**
   * Operation types listened to by this plugin:
   * - uc: UpdateCell
   * - ri: RowInsert
   * - rd: RowDelete
   * - ci: ColInsert
   * - cd: ColDelete
   */
  public override interestedIn = [MatrixOTActionName.UpdateCell, ...FormulaStructureChangeActionNames];

  /** Collected during shared startup scanning and scheduled once all dependencies are registered. */
  #initialDirtyKeys: CellKey[] = [];
  #initialDataComplete = false;
  readonly #astCache = new Map<CellKey, FormulaAST>();
  #commands: SheetCommandBus | null = null;
  #spillValidatorRegistered = false;

  /** Creates a SheetFormulaPlugin instance. */
  constructor(
    @Inject(IFormulaParser.symbol) private parser: IFormulaParser,
    @Inject(IDependencyGraph.symbol) private graph: IDependencyGraph,
    @Inject(IAggregationCache.symbol) private aggCache: IAggregationCache,
    @Inject(FormulaResultStore.symbol) private resultStore: FormulaResultStore,
    @Inject(RecalcScheduler.symbol) private scheduler: RecalcScheduler,
    @Inject(FormulaRefShifter.symbol) private refShifter: FormulaRefShifter,
    @Inject(FormulaCalculationTraceBus.symbol) private trace: FormulaCalculationTraceBus,
    @Inject(DataEngine.symbol) private readonly dataEngine?: DataEngine,
    @Inject(Platform.symbol) private readonly platform?: Platform,
    @Inject(IFormulaResultProvider.symbol) private readonly results?: IFormulaResultProvider,
    @Inject(FormulaResultProviderRegistry.symbol) private readonly resultProviders?: FormulaResultProviderRegistry,
    @Inject(FormulaRichResultProviderRegistry.symbol) private readonly richResultProviders?: FormulaRichResultProviderRegistry,
    @Inject(FormulaSourceProviderRegistry.symbol) private readonly sourceProviders?: FormulaSourceProviderRegistry,
    @Inject(IFunctionRegistry.symbol) private readonly functions?: IFunctionRegistry,
    @Inject(IFormulaExternalServiceProvider.symbol) private readonly externalServices?: IFormulaExternalServiceProvider,
    @Inject(IFormulaTextServiceProvider.symbol) private readonly textServices?: IFormulaTextServiceProvider,
    @Inject(SheetCellInputValidationRegistry.symbol)
    private readonly inputValidation?: SheetCellInputValidationRegistry,
    @Inject(FormulaSchedulerDataSource.symbol)
    private readonly schedulerDataSource?: FormulaSchedulerDataSource,
  ) {
    super({
      key: pluginKey,
      state: null,
    });

    for (const name of [
      'parser', 'graph', 'aggCache', 'resultStore', 'scheduler', 'refShifter', 'trace',
      'dataEngine', 'platform', 'results', 'resultProviders', 'richResultProviders',
      'sourceProviders', 'functions', 'externalServices', 'textServices',
      'inputValidation',
      'schedulerDataSource',
    ]) Object.defineProperty(this, name, { writable: false, configurable: false });

    this.scheduler.bindAstCache(this.#astCache);
  }

  /**
   * Registers formula host commands.
   * @param commands - Command bus owned by one editor instance.
   */
  public registerCommands(commands: SheetCommandBus): void {
    if (this.#commands && this.#commands !== commands) {
      throw new SearError('Sheet formula commands are already bound to an editor.');
    }
    this.#commands = commands;
    if (this.inputValidation && !this.#spillValidatorRegistered) {
      this.inputValidation.register('sheet.formula.spill', (row, col) => {
        const reject = this.resultStore.isSpillCell(row, col);
        return reject
          ? { valid: false, reject: true, message: 'Spilled array cells cannot be edited directly. Edit or clear the anchor formula first.' }
          : { valid: true, reject: false };
      }, { protectClear: true });
      this.#spillValidatorRegistered = true;
    }
    registerFormulaStatusCommands(commands, this, this.scheduler);
    if (this.functions) registerSheetFormulaFunctionCommands(commands, this.functions);
    if (this.externalServices && this.textServices) {
      registerSheetFormulaServiceCommands(commands, this.externalServices, this.textServices);
    }
    if (typeof this.scheduler.bindCommandBus === 'function') registerFormulaRecalculationCommands(commands, this.scheduler);
    if (this.resultProviders && this.richResultProviders && this.sourceProviders) {
      registerFormulaProviderCommands(commands, {
        results: this.resultProviders,
        richResults: this.richResultProviders,
        sources: this.sourceProviders,
      });
    }
  }

  /** Seals provider registration once every configured Sheet plugin has started. */
  public enforceProviderCommandBoundary(
    commands: SheetCommandBus,
    workbookOwnership?: FormulaRegistryOwnership,
  ): void {
    this.#initialDataComplete = true;
    const isExecuting = commands.isExecuting.bind(commands);
    FormulaCalculationTraceBus.prototype.enforceCommandBoundary.call(this.trace, isExecuting);
    if (this.graph instanceof DependencyGraph) {
      DependencyGraph.prototype.enforceCommandBoundary.call(this.graph, isExecuting);
    } else this.graph.enforceCommandBoundary(isExecuting);
    if (this.aggCache instanceof AggregationCache) {
      AggregationCache.prototype.enforceCommandBoundary.call(this.aggCache, isExecuting);
    } else this.aggCache.enforceCommandBoundary(isExecuting);
    FormulaResultStore.prototype.enforceCommandBoundary.call(this.resultStore, isExecuting);
    if (this.functions && !workbookOwnership?.functions) {
      const remove = (id: number) => commands.run(UnregisterSheetFormulaFunctionCommand, id);
      if (this.functions instanceof FunctionRegistry) {
        FunctionRegistry.prototype.enforceCommandBoundary.call(this.functions, isExecuting, remove);
      } else this.functions.enforceCommandBoundary(isExecuting, remove);
    }
    if (this.externalServices && !workbookOwnership?.externalServices) {
      const remove = (id: number) => commands.run(UnregisterSheetFormulaExternalServiceCommand, id);
      if (this.externalServices instanceof FormulaExternalServiceRegistry) {
        FormulaExternalServiceRegistry.prototype.enforceCommandBoundary.call(this.externalServices, isExecuting, remove);
      } else this.externalServices.enforceCommandBoundary(isExecuting, remove);
    }
    if (this.textServices && !workbookOwnership?.textServices) {
      if ((this.textServices.registerLanguageService || this.textServices.registerPhoneticReader) &&
          (!this.textServices.enforceCommandBoundary || !this.textServices.unregisterRegistration)) {
        throw new SearError('Mutable formula text providers must enforce the editor command boundary.');
      }
      const remove = (id: number) => commands.run(UnregisterSheetFormulaTextServiceCommand, id);
      if (this.textServices instanceof FormulaTextServiceRegistry) {
        FormulaTextServiceRegistry.prototype.enforceCommandBoundary.call(this.textServices, isExecuting, remove);
      } else this.textServices.enforceCommandBoundary?.(isExecuting, remove);
    }
    if (!this.resultProviders || !this.richResultProviders || !this.sourceProviders) return;
    sealFormulaProviderRegistries(commands, {
      results: this.resultProviders,
      richResults: this.richResultProviders,
      sources: this.sourceProviders,
    });
  }

  /** Contributes formula identity updates to the same atomic cell-move plan. */
  public registerRangeMoves(registry: SheetRangeMoveRegistry): void {
    if (this.dataEngine) registerFormulaRangeMoves(registry, this.parser, this.dataEngine);
  }

  public registerRangeReorders(registry: SheetRangeReorderRegistry): void {
    if (this.dataEngine) registerFormulaRangeReorders(registry, this.parser, this.dataEngine, this.resultStore);
  }

  /** Plans persisted reference rewrites for complete row and column reordering. */
  public registerStructureMoves(registry: SheetStructureMoveRegistry): void {
    if (this.dataEngine) registerFormulaStructureMoves(registry, this.parser, this.dataEngine);
  }

  /** Registers formula calculation trace as an editor-local host observation. */
  public registerObservations(observations: ObservationRegistry): void {
    observations.register(FormulaCalculationTraceObservation, {
      subscribe: this.trace.subscribeFormulaCalculationTrace.bind(this.trace),
    });
  }

  /** @inheritdoc */
  public override registerConfig() {
    return [
      {
        key: pluginKey,
        config: new ConfigUnit(formulaReferenceHighlightConfig),
      },
    ];
  }

  /**
   * Receives cells from shared startup scanning and builds AST/dependency
   * indexes for existing formula cells.
   *
   * Initial data such as content.json is injected directly into SheetDataPlugin
   * and does not pass through the command pipeline -> apply, so formula-derived
   * indexes must be built here.
   */
  public onInitialDataCell(_searCore: SearCoreSheet, value: unknown, row: number, col: number): void {
    if (this.#initialDataComplete) {
      throw new SearError('Sheet formula initial data scanning has completed.');
    }
    const cell = value as CellMatrixElement;
    if (!cell || cell.type !== CellType.Formula || !cell.formula) return;

    const key = cellKey(row, col);
    try {
      const ast = this.parser.parse(cell.formula);
      this.#astCache.set(key, ast);
      const deps = this.parser.extractDependencies(ast);
      const previousDependencies = this.graph.getDependencies(key);
      this.graph.updateCell(key, deps);
      this.emitDependencyChange(key, previousDependencies, this.graph.getDependencies(key));
      this.#initialDirtyKeys.push(key);
    } catch (e) {
      // Parse failure: skip this formula, matching apply behavior.
      this.platform?.warn?.(`[Formula] Failed to parse initial formula at (${row},${col}):`, e);
    }
  }

  /** Starts one recalculation after dependencies for all initial formulas have been registered. */
  public onInitialDataComplete(_searCore: SearCoreSheet): void {
    if (this.#initialDataComplete) {
      throw new SearError('Sheet formula initial data scanning has completed.');
    }
    this.#initialDataComplete = true;
    if (this.#initialDirtyKeys.length > 0) {
      this.scheduler.markDirty(this.#initialDirtyKeys);
      this.#initialDirtyKeys = [];
    }
  }

  /** Formula indexes are editor-local and do not enter Sheet document views. */
  public registerState() {
    return { key: this.key, state: null, dataEngine: { enabled: false } };
  }

  /** Returns the plugin config. */
  public getPluginConfig(): unknown {
    return {};
  }

  /**
   * Rejects unsupported structure operations before the owning transaction commits.
   * Derived ASTs are not staged as plugin state.
   */
  public apply(_pluginState: FormulaPluginState, transaction: Transaction): null {
    if (transaction.pluginKey !== SheetDataPlugin.pluginKey) return null;
    for (const operation of transaction.operations) {
      const change = matrixOperationToStructureChange(operation);
      if (change) assertSupportedStructureChange(change);
    }
    return null;
  }

  #updateAstCache(transaction: Transaction): void {
    const astCache = this.#astCache;
    const hasPersistedReferenceRewrites =
      transaction.operations.some(
        (operation) => isUpdateCellOperation(operation) && operation.uc.intent === MatrixCellUpdateIntent.Relocation,
      ) && transaction.operations.some((operation) => matrixOperationToStructureChange(operation) !== null);

    for (const op of transaction.operations) {
      // ─── UpdateCell: Cell Value Update ───
      if (MatrixOTActionName.UpdateCell in op) {
        const updateOp = op as UpdateCellOTOperation<CellMatrixElement>;
        const row = updateOp.p[0];
        const col = updateOp.p[1];
        const key = cellKey(row, col);
        const newCell = updateOp[MatrixOTActionName.UpdateCell].value;

        // Check whether the new value is a formula cell.
        if (newCell && newCell.type === CellType.Formula && newCell.formula) {
          // Formula cell: parse and register.
          try {
            const ast = this.parser.parse(newCell.formula);
            astCache.set(key, ast);
            this.parser.extractDependencies(ast);
          } catch (e) {
            // Parse failure: clear formula-related state.
            astCache.delete(key);
          }
        } else if (astCache.has(key)) {
          // Formula was overwritten with a plain value: remove formula-related state.
          astCache.delete(key);
        }
      } else {
        const change = matrixOperationToStructureChange(op);
        if (change) {
          if (hasPersistedReferenceRewrites) this.rebaseAstCacheKeys(astCache, change);
          else this.shiftAstCache(change, astCache);
          this.indexInsertedFormulas(op, change, astCache);
        }
      }
    }

  }

  /**
   * Rebuilds derived indexes after the owning document transaction commits.
   * @param transaction - Successfully committed transaction.
   */
  public override onTransactionCommitted(transaction: Transaction): void {
    if (this.#commands && !this.#commands.isExecuting()) {
      throw new SearError('Sheet formula changes must run through editor.commands.run(...).');
    }
    if (this.schedulerDataSource?.isSpillObstacleTransaction?.(transaction)) {
      this.aggCache.clear();
      this.resultStore.clear();
      this.scheduler.markDirty([...this.#astCache.keys()]);
      return;
    }
    if (transaction.pluginKey !== SheetDataPlugin.pluginKey) return;
    const affectsFormulaState = transaction.operations.some(
      (operation) => MatrixOTActionName.UpdateCell in operation || matrixOperationToStructureChange(operation) !== null,
    );
    if (!affectsFormulaState) return;
    this.#updateAstCache(transaction);
    if (transaction.operations.some((operation) => matrixOperationToStructureChange(operation) !== null)) {
      this.#reindexPersistedFormulas();
    }
    this.scheduler.invalidateFunctionCallIndexes();
    this.#rebuildDependencyGraph(this.#astCache);
    this.aggCache.clear();
    this.resultStore.clear();
    this.scheduler.markDirty([...this.#astCache.keys()]);
  }

  #reindexPersistedFormulas(): void {
    const sheetData = this.dataEngine ? readSheetDataMatrix(this.dataEngine) : null;
    if (!sheetData?.forEachStored) return;
    this.#astCache.clear();
    sheetData.forEachStored((cell, row, col) => this.indexFormulaCell(cell, row, col, this.#astCache));
  }

  /**
   * Render method; the formula plugin does not render nodes directly.
   *
   * Formula cells are rendered by FormulaCell through render-registry
   * registration. This plugin owns data updates, not visual presentation.
   */
  public render(): Node<CellProperties>[] {
    return [];
  }

  // ─── Internal Methods ───────────────────────────────────

  /**
   * Handles structural changes such as row/column insertion and deletion.
   *
   * Steps:
   * 1. Shift formula cells' own keys in the AST cache.
   * 2. Shift references inside all formula ASTs.
   * 3. After commit, rebuildDependencyGraph rebuilds reverse dependency indexes.
   * 4. After commit, derived caches are cleared and a full recalculation starts.
   */
  private shiftAstCache(change: StructureChange, astCache: Map<CellKey, FormulaAST>): void {
    this.rebaseAstCacheKeys(astCache, change);
    const shifted = this.refShifter.shiftAll(astCache, [change]);
    for (const { key, newAst } of shifted) {
      astCache.set(key, newAst);
      this.parser.extractDependencies(newAst);
    }
  }

  private indexInsertedFormulas(
    operation: OTOperation,
    change: StructureChange,
    astCache: Map<CellKey, FormulaAST>,
  ): void {
    if (getStructureChangeKind(change) !== StructureChangeKind.Insert) return;
    if (!('index' in change)) return;
    const insertedCells = Reflect.get(operation, change.type) as Array<CellMatrixElement | null> | undefined;
    if (!Array.isArray(insertedCells)) return;
    if (getStructureChangeAxis(change) === StructureChangeAxis.Row) {
      this.indexInsertedRowFormulas(insertedCells, change.index, astCache);
    } else {
      this.indexInsertedColumnFormulas(insertedCells, change.index, astCache);
    }
  }

  private indexInsertedRowFormulas(
    cells: Array<CellMatrixElement | null>,
    row: number,
    astCache: Map<CellKey, FormulaAST>,
  ): void {
    for (let col = 0; col < cells.length; col++) {
      this.indexFormulaCell(cells[col], row, col, astCache);
    }
  }

  private indexInsertedColumnFormulas(
    cells: Array<CellMatrixElement | null>,
    col: number,
    astCache: Map<CellKey, FormulaAST>,
  ): void {
    for (let row = 0; row < cells.length; row++) {
      this.indexFormulaCell(cells[row], row, col, astCache);
    }
  }

  private indexFormulaCell(
    cell: CellMatrixElement | null | undefined,
    row: number,
    col: number,
    astCache: Map<CellKey, FormulaAST>,
  ): void {
    if (!cell || cell.type !== CellType.Formula || !cell.formula) return;

    try {
      astCache.set(cellKey(row, col), this.parser.parse(cell.formula));
    } catch (e) {
      astCache.delete(cellKey(row, col));
    }
  }

  private rebaseAstCacheKeys(astCache: Map<CellKey, FormulaAST>, change: StructureChange): void {
    const rebased = new Map<CellKey, FormulaAST>();
    astCache.forEach((ast, key) => {
      const nextKey = this.shiftFormulaKey(key, change);
      if (nextKey !== null) rebased.set(nextKey, ast);
    });

    astCache.clear();
    rebased.forEach((ast, key) => astCache.set(key, ast));
  }

  private shiftFormulaKey(key: CellKey, change: StructureChange): CellKey | null {
    const [row, col] = fromCellKey(key);
    const shifted = this.shiftFormulaCoordinate(row, col, change);
    return shifted ? cellKey(shifted.row, shifted.col) : null;
  }

  private shiftFormulaCoordinate(
    row: number,
    col: number,
    change: StructureChange,
  ): { row: number; col: number } | null {
    const shiftedRow = shiftStructureCoordinate({ coordinate: row, axis: StructureChangeAxis.Row, changes: [change] });
    const shiftedCol = shiftStructureCoordinate({ coordinate: col, axis: StructureChangeAxis.Col, changes: [change] });
    if (shiftedRow.deleted || shiftedCol.deleted) return null;
    return { row: shiftedRow.value, col: shiftedCol.value };
  }

  #rebuildDependencyGraph(astCache: Map<CellKey, FormulaAST>): void {
    const previousDependencies = this.snapshotDependencies();
    this.graph.clear();
    astCache.forEach((ast, key) => {
      this.graph.updateCell(key, this.parser.extractDependencies(ast));
    });
    this.emitDependencyChanges(previousDependencies);
  }

  /**
   * IFormulaResultProvider implementation used by rendering to read formula results.
   *
   * Returns FormulaValue from resultStore, or undefined when it has not been
   * calculated yet. The rendering layer (FormulaCell) converts it to display text.
   */
  public getFormulaResult(row: number, col: number): FormulaValue | undefined {
    return typeof this.resultStore.getAt === 'function'
      ? this.resultStore.getAt(row, col)
      : this.resultStore.get(cellKey(row, col));
  }

  /** Returns rich metadata derived during the current formula evaluation. */
  public getFormulaRichResult(row: number, col: number): FormulaRichResult | undefined {
    return this.resultStore.getRichAt(row, col);
  }

  /** Activates a host-backed hyperlink after a primary-button cell click. */
  public onMouseUp(_searCore: SearCoreSheet, event: EventWithOffsetAndTarget<CellProperties>): boolean | void {
    if ((event.origin.button ?? 0) !== 0 || (event.clickCount ?? 1) > 1) return;
    const properties = event.target?.properties;
    if (properties?.region !== CellRegion.Grid) return;
    const row = properties.startRowIndex;
    const col = properties.startColIndex;
    if (row === undefined || col === undefined) return;
    const rich = this.richResultProviders?.getFormulaRichResult(row, col);
    if (rich?.kind !== 'hyperlink') return;
    const opener = this.externalServices?.get(FormulaHyperlinkServiceDefinition);
    if (!opener?.openTarget) return;
    opener.openTarget(rich.target);
    event.origin.preventDefault();
    return false;
  }

  public getFormulaResultFormat(row: number, col: number) {
    if (typeof this.getFormulaResult(row, col) !== 'number') return void 0;
    const ast = this.#astCache.get(cellKey(row, col));
    return ast?.kind === FormulaNodeKind.Call ? this.functions?.get(ast.name)?.defaultCellFormat : void 0;
  }

  /** Exposes derived spill coordinates to sparse range consumers. */
  public forEachFormulaResultInRange(
    startRow: number, startColumn: number, endRow: number, endColumn: number,
    visit: (row: number, column: number) => void,
  ): void {
    this.resultStore.forEachSpillInRange(startRow, startColumn, endRow, endColumn, visit);
  }

  /** IFormulaSourceProvider implementation used by editors to read persisted formula text. */
  public getFormulaSource(row: number, col: number): string | undefined {
    const cell = this.readSourceCell(row, col);
    return cell?.type === CellType.Formula && typeof cell.formula === 'string' ? cell.formula : void 0;
  }

  /**
   * IFormulaStatusProvider implementation used by hosts and plugins to inspect
   * formula source, result, dirty state, and dependency edges without touching
   * plugin-owned caches directly.
   */
  public getFormulaCellStatus(row: number, col: number): FormulaCellStatus {
    const key = cellKey(row, col);
    const cell = this.readSourceCell(row, col);
    const isFormulaCell = cell?.type === CellType.Formula;
    const formula = this.getFormulaSource(row, col);
    const result = isFormulaCell ? this.results?.getFormulaResult(row, col) ?? this.resultStore.get(key) : void 0;
    return {
      row,
      col,
      isFormulaCell,
      formula,
      result,
      errorCode: getFormulaErrorCode(result),
      dirty: isFormulaCell && this.graph.isDirty(key),
      dependencies: isFormulaCell ? this.graph.getDependencies(key) : [],
      dependents: this.graph.getDependents(key),
    };
  }

  private readSourceCell(row: number, col: number): CellMatrixElement | null | undefined {
    const sheetData = this.dataEngine ? readSheetDataMatrix(this.dataEngine) : null;
    return sheetData?.getItem(row, col);
  }

  private snapshotDependencies(): Map<CellKey, readonly Dependency[]> {
    const snapshot = new Map<CellKey, readonly Dependency[]>();
    for (const key of this.graph.getFormulaKeys()) {
      snapshot.set(key, this.graph.getDependencies(key));
    }
    return snapshot;
  }

  private emitDependencyChanges(previousDependencies: Map<CellKey, readonly Dependency[]>): void {
    const keys = new Set<CellKey>([...previousDependencies.keys(), ...this.graph.getFormulaKeys()]);
    for (const key of keys) {
      this.emitDependencyChange(key, previousDependencies.get(key) ?? [], this.graph.getDependencies(key));
    }
  }

  private emitDependencyChange(
    key: CellKey,
    previousDependencies: readonly Dependency[],
    dependencies: readonly Dependency[],
  ): void {
    if (dependenciesAreEqual(previousDependencies, dependencies)) return;
    const [row, col] = fromCellKey(key);
    this.trace.emit({
      type: FormulaDependenciesChangedEventType,
      key,
      row,
      col,
      previousDependencies,
      dependencies,
    });
  }
}

function getFormulaErrorCode(value: FormulaValue | undefined) {
  return isFormulaError(value) ? value.code : void 0;
}

function isFormulaError(value: FormulaValue | undefined): value is FormulaError {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Partial<FormulaError>;
  return candidate.kind === 'error' && isFormulaErrorCode(candidate.code);
}

function dependenciesAreEqual(left: readonly Dependency[], right: readonly Dependency[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
import { SheetRangeMoveRegistry, SheetRangeReorderRegistry } from '@searsuite/sear-assembly-plugin';
import { type SheetStructureMoveRegistry } from '@searsuite/sear-assembly-plugin';
import { registerFormulaStructureMoves } from '../registerFormulaStructureMoves';
import { isUpdateCellOperation, MatrixCellUpdateIntent } from '@searsuite/sear-domain-ot';
import { registerFormulaRangeMoves } from '../registerFormulaRangeMoves';
import { registerFormulaRangeReorders } from '../registerFormulaRangeReorders';
