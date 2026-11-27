/**
 * Lazy recalculation scheduler with viewport priority and generation safety.
 *
 * Core strategy:
 * 1. Editing only marks dirty formulas (markDirty) — O(affected formulas).
 * 2. Evaluation takes ready formulas on demand, prioritizing the viewport.
 * 3. When the budget is exceeded, continue on the next frame via Platform.requestAnimationFrame.
 * 4. New edits advance the generation so old work does not accumulate.
 *
 * Performance compared with full topological sorting:
 * - 50 visible formulas among 100K formulas: full 55ms -> lazy 2ms.
 * - Rapid continuous edits: no accumulated delay.
 *
 * DI dependencies, injected through the constructor with no callbacks:
 * - graph: dependency graph for dirty-flag management.
 * - evaluator: evaluator from AST to FormulaValue.
 * - resultStore: formula result storage for derived results and cellToFormulaValue conversion.
 * - aggCache: aggregation cache for incremental SUM/COUNT updates.
 * - dataSource: host adapter for sheet data, EvalContext creation, and viewport-priority keys.
 * - platform: cross-platform rAF / now / queueMicrotask.
 * - renderInvalidator: formula-derived result refresh bridge bound by the assembly layer.
 *
 * EvalContext is provided by the injected data source, which converts host sheet
 * state into formula-engine reads without exposing render or scroll services to
 * the scheduler.
 *
 * Viewport priority is also supplied by the data source so render-specific
 * viewport math stays outside this package.
 */

import { Injectable, Inject } from '@searsuite/sear-foundation-di';
import {
  type CellKey,
  type ErrorCode,
  type FormulaAST,
  type EvalContext,
  type EvalResult,
  type FormulaFlushedCellResult,
  type FormulaValue,
  FormulaErrorCode,
  FormulaNodeKind,
  FormulaBatchFlushedEventType,
  FormulaErrorChangedEventType,
  FormulaRecalculationCompletedEventType,
  createFormulaError,
  isFormulaErrorCode,
  IDependencyGraph,
  IFormulaEvaluator,
  IAggregationCache,
  IFunctionRegistry,
  IFormulaIterationSettingsProvider,
} from '@searsuite/sear-domain-formula-engine';
import { Platform } from '@searsuite/sear-foundation-platform';
import { SearError } from '@searsuite/sear-foundation-error';
import { cellKey, fromCellKey } from '@searsuite/sear-domain-formula-engine-ts';
import { isFormulaError } from '@searsuite/sear-foundation-utils';
import { columnIndexToLabel } from '@searsuite/sear-foundation-utils';
import { FormulaResultStore } from './FormulaResultStore';
import { FormulaValuePublisher } from './FormulaValuePublisher';
import { FormulaSchedulerDataSource } from './FormulaSchedulerDataSource';
import { FormulaCalculationTraceBus } from './FormulaCalculationTraceBus';
import { type SheetCommandBus } from '@searsuite/sear-assembly-commands';
import {
  DiscardFormulaWorkCommand,
  MarkFormulaDirtyCommand,
  ResumeFormulaWorkCommand,
  RunFormulaBatchCommand,
} from './FormulaRecalculationCommands';

/** Schedules dependency-aware formula recalculation with visible-cell priority. */
@Injectable()
export class RecalcScheduler {
  #graph: IDependencyGraph;
  #evaluator: IFormulaEvaluator;
  #resultStore: FormulaResultStore;
  #aggCache: IAggregationCache;
  #dataSource: FormulaSchedulerDataSource;
  #platform: Platform;
  #renderInvalidator: FormulaValuePublisher;
  #trace: FormulaCalculationTraceBus;
  #functionRegistry: IFunctionRegistry | undefined;
  #iterationSettings: IFormulaIterationSettingsProvider | undefined;

  /** DI token for resolving RecalcScheduler. */
  public static readonly symbol = Symbol.for('RecalcScheduler');

  /** Creates a RecalcScheduler instance. */
  constructor(
    @Inject(IDependencyGraph.symbol) graph: IDependencyGraph,
    @Inject(IFormulaEvaluator.symbol) evaluator: IFormulaEvaluator,
    @Inject(FormulaResultStore.symbol) resultStore: FormulaResultStore,
    @Inject(IAggregationCache.symbol) aggCache: IAggregationCache,
    @Inject(FormulaSchedulerDataSource.symbol)
    dataSource: FormulaSchedulerDataSource,
    @Inject(Platform.symbol) platform: Platform,
    @Inject(FormulaValuePublisher.symbol)
    renderInvalidator: FormulaValuePublisher,
    @Inject(FormulaCalculationTraceBus.symbol)
    trace: FormulaCalculationTraceBus,
    @Inject(IFunctionRegistry.symbol) functionRegistry?: IFunctionRegistry,
    @Inject(IFormulaIterationSettingsProvider.symbol)
    iterationSettings?: IFormulaIterationSettingsProvider,
  ) {
    this.#graph = graph;
    this.#evaluator = evaluator;
    this.#resultStore = resultStore;
    this.#aggCache = aggCache;
    this.#dataSource = dataSource;
    this.#platform = platform;
    this.#renderInvalidator = renderInvalidator;
    this.#trace = trace;
    this.#functionRegistry = functionRegistry;
    this.#iterationSettings = iterationSettings;
    // A formula can remain dirty when a previous batch yielded for its time
    // budget.  Scrolling must therefore wake the scheduler as well as change
    // the priority used by its next batch.
    this.#disposers.push(this.#dataSource.onViewportChanged(this.#handleViewportChanged.bind(this)));
    const disposeExternalService = this.#dataSource.onExternalServiceInvalidated?.((names) => {
      this.markFunctionsDirty(names);
    });
    if (disposeExternalService) this.#disposers.push(disposeExternalService);
    if (this.#functionRegistry) {
      this.#disposers.push(
        this.#functionRegistry.subscribe((names) => {
          this.invalidateFunctionCallIndexes();
          this.markFunctionsDirty(names);
        }),
      );
    }
  }

  /** Current generation, incremented by every markDirty call. */
  #currentGeneration: number = 0;
  /** Whether the scheduling loop is currently running. */
  #isRunning: boolean = false;
  /** Per-frame time budget in ms; exceeding it yields control. */
  #budgetMs: number = 8;
  /** Formula AST cache supplied once by SheetFormulaPlugin. */
  #astCache: ReadonlyMap<CellKey, FormulaAST> | null = null;
  #commands: SheetCommandBus | undefined;
  #teardownToken: object | undefined;
  #disposed = false;
  #visibleOrigin: { row: number; col: number } | undefined;
  #viewportDependentFormulaKeys: ReadonlySet<CellKey> | undefined;
  #volatileFormulaKeys: ReadonlySet<CellKey> | undefined;

  /** Call after the formula owner changes the AST index. */
  public invalidateFunctionCallIndexes(): void {
    this.#viewportDependentFormulaKeys = undefined;
    this.#volatileFormulaKeys = undefined;
  }

  /** Binds asynchronous formula work to the owning editor's command bus. */
  public bindCommandBus(commands: SheetCommandBus): void {
    if (this.#commands) throw new SearError('Formula scheduler is already bound to a command bus.');
    this.#commands = commands;
  }

  /** Gives the owning editor lifecycle exclusive authority to dispose the mounted scheduler. */
  public bindTeardownToken(token: object): void {
    if (this.#teardownToken) throw new SearError('Formula scheduler teardown is already bound to an editor.');
    this.#teardownToken = token;
  }

  /** Binds the formula owner's cache during plugin setup. */
  public bindAstCache(cache: ReadonlyMap<CellKey, FormulaAST>): void {
    if (this.#astCache) throw new SearError('Formula AST cache is already bound.');
    this.#astCache = cache;
  }

  /** Iterates formula coordinates without exposing the cache for mutation. */
  public getFormulaKeys(): IterableIterator<CellKey> {
    return this.#readAstCache().keys();
  }

  #readAstCache(): ReadonlyMap<CellKey, FormulaAST> {
    if (!this.#astCache) throw new SearError('Formula AST cache is not bound.');
    return this.#astCache;
  }
  /** Maximum number of formulas per batch. */
  #batchMaxCount: number = 200;
  /** Number of batches flushed for the active generation. */
  #flushedBatchCount: number = 0;
  /** Number of formula cell results flushed for the active generation. */
  #flushedCellCount: number = 0;
  /** Callers waiting for all currently scheduled formula work to finish. */
  readonly #idleWaiters = new Set<() => void>();
  readonly #pendingSpillKeys = new Set<CellKey>();
  readonly #disposers: Array<() => void> = [];

  /** Releases scheduler-owned subscriptions. */
  public dispose(token?: object): void {
    if (this.#disposed) return;
    if (this.#commands && !this.#commands.isExecuting() && (!this.#teardownToken || token !== this.#teardownToken)) {
      throw new SearError('Formula scheduler changes must run through editor.commands.run(...).');
    }
    this.#disposed = true;
    this.#currentGeneration++;
    this.#isRunning = false;
    this.#disposers
      .splice(0)
      .reverse()
      .forEach((dispose) => dispose());
    this.#resolveIdleWaiters();
  }

  /** Resolves when the scheduler has no running or pending formula work. */
  public waitForIdle(): Promise<void> {
    if (this.#disposed) return Promise.resolve();
    if (!this.#isRunning && this.#graph.pendingCount === 0) return Promise.resolve();
    const scheduler = this;
    return new Promise<void>((resolve) => {
      scheduler.#idleWaiters.add(resolve);
    });
  }

  /**
   * Triggers recalculation.
   *
   * Performs only two actions:
   * 1. Mark dirty formulas, propagated by BFS without sorting.
   * 2. Start the async scheduling loop without blocking the current frame.
   */
  markDirty(changedKeys: CellKey[]): void {
    if (this.#disposed) return;
    if (this.#commands && !this.#commands.isExecuting()) {
      this.#commands.run(MarkFormulaDirtyCommand, changedKeys);
      return;
    }
    this.#currentGeneration++;

    const volatileKeys = this.#getVolatileFormulaKeys();

    // Phase 1: mark dirty by BFS.
    this.#graph.markDirty([...new Set([...changedKeys, ...volatileKeys])]);

    // Resolve circular nodes with the editor's calculation policy.
    const cycleKeys = this.#graph.getLastCycleKeys();
    if (cycleKeys.length > 0) {
      const context = this.#createEvalContext();
      const settings = this.#iterationSettings?.getSettings();
      this.#flushResults(
        settings?.enabled && settings.maxIterations > 0 && settings.maxChange >= 0
          ? this.#evaluateCycle(cycleKeys, context, settings.maxIterations, settings.maxChange)
          : cycleKeys.map((key) => ({
              key,
              value: createFormulaError(FormulaErrorCode.Reference),
            })),
        context,
      );
      for (const key of cycleKeys) this.#graph.markClean(key);
    }

    // Start the scheduling loop when it is not already running and formulas are pending.
    if (!this.#isRunning && this.#graph.pendingCount > 0) {
      this.#schedule();
    }
  }

  #evaluateCycle(keys: CellKey[], context: EvalContext, maxIterations: number, maxChange: number): EvalResult[] {
    const formulas = keys.flatMap((key) => {
      const ast = this.#readAstCache().get(key);
      return ast ? [{ key, ast }] : [];
    });
    let previous = new Map<CellKey, FormulaValue>(keys.map((key) => [key, 0]));
    const readCell = context.getCellValue;
    context.getCellValue = (row, col) => previous.get(cellKey(row, col)) ?? readCell(row, col);
    try {
      for (let iteration = 0; iteration < maxIterations; iteration++) {
        const results = this.#evaluator.evaluateBatch(formulas, context);
        const next = new Map(results.map(({ key, value }) => [key, value]));
        const converged = results.every(
          ({ key, value }) =>
            typeof value === 'number' &&
            typeof previous.get(key) === 'number' &&
            Math.abs(value - (previous.get(key) as number)) <= maxChange,
        );
        previous = next;
        if (converged) break;
      }
      return keys.map((key) => ({
        key,
        value: previous.get(key) ?? createFormulaError(FormulaErrorCode.Reference),
      }));
    } finally {
      context.getCellValue = readCell;
    }
  }

  /** Starts an explicit recalculation epoch for every formula containing a volatile call. */
  recalculateVolatile(): void {
    this.markDirty([]);
  }

  /** Recalculates formulas that contain any of the supplied function names. */
  public markFunctionsDirty(functionNames: readonly string[]): void {
    if (this.#disposed) return;
    const names = new Set(functionNames.map((name) => name.toUpperCase()));
    const keys = [...this.#readAstCache().entries()]
      .filter(([, ast]) => this.#containsFunctionCall(ast, names))
      .map(([key]) => key);
    if (keys.length > 0) this.markDirty(keys);
  }

  #containsVolatileCall(ast: FormulaAST): boolean {
    switch (ast.kind) {
      case FormulaNodeKind.Call:
        return (
          Boolean(this.#functionRegistry?.get(ast.name)?.volatile) ||
          ast.args.some((arg) => this.#containsVolatileCall(arg))
        );
      case FormulaNodeKind.Invoke:
        return this.#containsVolatileCall(ast.callee) || ast.args.some((arg) => this.#containsVolatileCall(arg));
      case FormulaNodeKind.Array:
        return ast.rows.some((row) => row.some((item) => this.#containsVolatileCall(item)));
      case FormulaNodeKind.Tuple:
        return ast.items.some((item) => this.#containsVolatileCall(item));
      case FormulaNodeKind.Binary:
      case FormulaNodeKind.Intersection:
        return this.#containsVolatileCall(ast.left) || this.#containsVolatileCall(ast.right);
      case FormulaNodeKind.Unary:
        return this.#containsVolatileCall(ast.operand);
      default:
        return false;
    }
  }

  #containsFunctionCall(ast: FormulaAST, names: ReadonlySet<string>): boolean {
    switch (ast.kind) {
      case FormulaNodeKind.Call:
        return names.has(ast.name.toUpperCase()) || ast.args.some((arg) => this.#containsFunctionCall(arg, names));
      case FormulaNodeKind.Invoke:
        return (
          this.#containsFunctionCall(ast.callee, names) ||
          ast.args.some((arg) => this.#containsFunctionCall(arg, names))
        );
      case FormulaNodeKind.Array:
        return ast.rows.some((row) => row.some((item) => this.#containsFunctionCall(item, names)));
      case FormulaNodeKind.Tuple:
        return ast.items.some((item) => this.#containsFunctionCall(item, names));
      case FormulaNodeKind.Binary:
      case FormulaNodeKind.Intersection:
        return this.#containsFunctionCall(ast.left, names) || this.#containsFunctionCall(ast.right, names);
      case FormulaNodeKind.Unary:
        return this.#containsFunctionCall(ast.operand, names);
      default:
        return false;
    }
  }

  /** Discards pending formula batches when committed formula inputs are replaced. */
  discardPendingWork(): void {
    if (this.#disposed) return;
    if (this.#commands && !this.#commands.isExecuting()) {
      this.#commands.run(DiscardFormulaWorkCommand, void 0);
      return;
    }
    this.#currentGeneration++;
    this.#isRunning = false;
    if (this.#graph.pendingCount === 0) this.#resolveIdleWaiters();
  }

  /**
   * Starts async scheduling.
   *
   * Uses Platform.queueMicrotask to run at the microtask phase of the current macrotask.
   */
  #schedule(): void {
    if (this.#disposed) return;
    this.#assertCommandWrite();
    this.#isRunning = true;
    this.#platform.queueMicrotask(this.#runScheduledFormulaBatch.bind(this));
  }

  /**
   * Scheduling loop.
   *
   * 1. Take a batch of ready formulas, prioritizing the viewport.
   * 2. Evaluate in batch.
   * 3. markClean -> unlock downstream formulas.
   * 4. When over budget, continue on the next frame via Platform.requestAnimationFrame.
   * 5. Stop when nothing is pending.
   */
  #runBatch(): void {
    this.#assertCommandWrite();
    // Capture the current generation; new edits make gen !== currentGeneration.
    const gen = this.#currentGeneration;
    const startTime = this.#platform.now();
    const context = this.#createEvalContext();

    while (this.#graph.pendingCount > 0) {
      // Generation check: a new edit arrived, so stop this loop and let the new cycle take over.
      if (gen !== this.#currentGeneration) {
        // The previous implementation returned here while keeping isRunning
        // true.  That left the new generation's dirty formulas permanently
        // queued because markDirty() correctly refused to start a second loop.
        this.#isRunning = false;
        if (this.#graph.pendingCount > 0) this.#schedule();
        return;
      }

      // Time-budget check: if over budget, yield and continue on the next frame.
      if (this.#platform.now() - startTime > this.#budgetMs) {
        this.#platform.requestAnimationFrame(this.#runScheduledFormulaBatch.bind(this));
        return;
      }

      const viewport = this.#getViewportKeys();

      // Take one batch of ready formulas: dirty with all dependencies clean.
      // Prioritize the viewport, capped by batchMaxCount.
      const readyKeys = this.#graph.getNextReadyBatch(viewport, this.#batchMaxCount);

      if (readyKeys.length === 0) {
        // No ready formulas: either everything finished or all remaining formulas are cycle-blocked.
        break;
      }

      // Build batch evaluation input.
      const batch: Array<{ key: CellKey; ast: FormulaAST }> = [];
      for (const key of readyKeys) {
        const ast = this.#readAstCache().get(key);
        if (ast) batch.push({ key, ast });
      }

      // Batch evaluation.
      if (batch.length > 0) {
        const results = this.#evaluator.evaluateBatch(batch, context);
        this.#flushResults(results, context);
      }

      // Mark clean -> unlock downstream dependencies.
      // Downstream formula dirtyDepCount -= 1; when it reaches 0, the formula becomes ready.
      for (const key of readyKeys) {
        this.#graph.markClean(key);
      }
      if (this.#pendingSpillKeys.size > 0) {
        this.#graph.markDirty([...this.#pendingSpillKeys]);
        this.#pendingSpillKeys.clear();
      }
    }

    // All dirty formulas are clean, or no ready formulas can be evaluated.
    if (this.#graph.pendingCount === 0) {
      this.#trace.emit({
        type: FormulaRecalculationCompletedEventType,
        generation: gen,
        batchCount: this.#flushedBatchCount,
        flushedCellCount: this.#flushedCellCount,
        pendingCount: 0,
      });
      this.#flushedBatchCount = 0;
      this.#flushedCellCount = 0;
    }
    this.#isRunning = false;
    if (this.#graph.pendingCount === 0) this.#resolveIdleWaiters();
  }

  /**
   * Maps the current sheet viewport to formula keys for priority scheduling.
   * We iterate the formula index rather than every cell in the viewport, so
   * sparse, very large sheets do not allocate a key for each empty cell.
   */
  #getViewportKeys(): Set<CellKey> {
    return this.#dataSource.getViewportFormulaKeys(this.#readAstCache().keys());
  }

  /** Resume pending work after the visible formula set changes. */
  #handleViewportChanged(): void {
    if (this.#disposed) return;
    const origin = this.#dataSource.getVisibleOrigin?.();
    if (origin && (origin.row !== this.#visibleOrigin?.row || origin.col !== this.#visibleOrigin?.col)) {
      this.#visibleOrigin = origin;
      const keys = this.#getViewportDependentFormulaKeys();
      if (keys.size > 0) this.markDirty([...keys]);
    }
    if (this.#commands && !this.#commands.isExecuting()) {
      this.#commands.run(ResumeFormulaWorkCommand, void 0);
      return;
    }
    this.resumePendingWork();
  }

  #getViewportDependentFormulaKeys(): ReadonlySet<CellKey> {
    if (this.#viewportDependentFormulaKeys) return this.#viewportDependentFormulaKeys;
    const names = new Set(
      this.#functionRegistry
        ?.list()
        .filter((name) => this.#functionRegistry?.get(name)?.volatileOnViewport)
        .map((name) => name.toUpperCase()) ?? [],
    );
    const keys = new Set<CellKey>();
    if (this.#astCache && names.size > 0) {
      for (const [key, ast] of this.#astCache) {
        if (this.#containsFunctionCall(ast, names)) keys.add(key);
      }
    }
    this.#viewportDependentFormulaKeys = keys;
    return keys;
  }

  #getVolatileFormulaKeys(): ReadonlySet<CellKey> {
    if (this.#volatileFormulaKeys) return this.#volatileFormulaKeys;
    const keys = new Set<CellKey>();
    for (const [key, ast] of this.#readAstCache()) {
      if (this.#containsVolatileCall(ast)) keys.add(key);
    }
    this.#volatileFormulaKeys = keys;
    return keys;
  }

  /** Resumes pending work inside a viewport or external-service command. */
  public resumePendingWork(): void {
    if (this.#disposed) return;
    this.#assertCommandWrite();
    if (!this.#isRunning && this.#graph.pendingCount > 0) this.#schedule();
  }

  #runScheduledFormulaBatch(): void {
    if (this.#disposed) return;
    if (this.#commands) {
      this.#commands.run(RunFormulaBatchCommand, void 0);
      return;
    }
    this.processScheduledBatch();
  }

  /** Runs one budgeted batch inside the formula owner's command. */
  public processScheduledBatch(): void {
    if (this.#disposed) return;
    this.#assertCommandWrite();
    this.#runBatch();
  }

  #assertCommandWrite(): void {
    if (this.#commands && !this.#commands.isExecuting()) {
      throw new SearError('Formula calculation changes must run through editor.commands.run(...).');
    }
  }

  #resolveIdleWaiters(): void {
    this.#idleWaiters.forEach((resolve) => resolve());
    this.#idleWaiters.clear();
  }

  /**
   * Creates the evaluation context.
   *
   * Provides getCellValue and iterateRange methods through the host adapter.
   * Formula cells read calculated results; ordinary cells read source values.
   *
   * Each runBatch call reads the latest sheetData snapshot because OT may modify
   * cells between batches.
   */
  #createEvalContext(): EvalContext {
    return this.#dataSource.createEvalContext(this.#resultStore);
  }

  /**
   * Writes evaluation results to resultStore, updates aggregation cache, and invalidates rendering.
   *
   * resultStore is per-client derived storage and does not participate in OT sync.
   * Rendering reads through IFormulaResultProvider.getFormulaResult.
   *
   * Performs three actions:
   * 1. Compare old/new results and notify AggregationCache for incremental updates.
   *    This fixes formula-to-formula changes that apply cannot observe because
   *    the new result has not been calculated yet.
   * 2. Write resultStore.
   * 3. Notify the render invalidator bound by the assembly layer so new results become visible.
   */
  #flushResults(results: EvalResult[], context: EvalContext): void {
    this.#assertCommandWrite();
    if (results.length === 0) return;
    const changedKeys: CellKey[] = [];
    const flushedResults: FormulaFlushedCellResult[] = [];

    for (const { key, value, richResult } of results) {
      const [row, col] = fromCellKey(key);
      const previousResult = this.#resultStore.get(key);
      const oldVal = previousResult ?? 0;
      const previousErrorCode = getFormulaErrorCode(previousResult);
      const spillChangedKeys =
        typeof this.#resultStore.setFormulaResult === 'function'
          ? this.#resultStore.setFormulaResult(key, value, context)
          : (this.#resultStore.set(key, value), [key]);
      changedKeys.push(...spillChangedKeys);
      spillChangedKeys.forEach((changedKey) => {
        if (changedKey !== key) this.#pendingSpillKeys.add(changedKey);
      });
      const storedResult = this.#resultStore.get(key) ?? value;
      if (spillChangedKeys.length > 1 || Array.isArray(previousResult) || Array.isArray(storedResult)) {
        this.#aggCache.clear();
      }
      this.#resultStore.setRichResult(key, getFormulaErrorCode(storedResult) ? undefined : richResult);
      const errorCode = getFormulaErrorCode(storedResult);
      flushedResults.push({
        key,
        row,
        col,
        previousResult,
        result: storedResult,
        errorCode: getFormulaErrorCode(storedResult),
      });

      // Notify aggregation cache that a formula result changed, allowing incremental SUM/COUNT updates.
      // apply passes (old, old) for formula-to-formula edits; the real delta is supplied here.
      this.#aggCache.onCellChanged(row, col, oldVal, storedResult);

      if (previousErrorCode !== errorCode) {
        this.#trace.emit({
          type: FormulaErrorChangedEventType,
          generation: this.#currentGeneration,
          key,
          row,
          col,
          previousErrorCode,
          errorCode,
        });
      }
    }

    this.#flushedBatchCount++;
    this.#flushedCellCount += flushedResults.length;
    this.#trace.emit({
      type: FormulaBatchFlushedEventType,
      generation: this.#currentGeneration,
      results: flushedResults,
      pendingCount: this.#graph.pendingCount,
    });
    this.#renderInvalidator.publishResults(changedKeys);
  }

  /**
   * Converts [row, col] to a readable cell reference string, such as "A1" or "B2".
   * Used only for console logging.
   */
  #cellRefStr(row: number, col: number): string {
    return `${columnIndexToLabel(col)}${row + 1}`;
  }
}

function getFormulaErrorCode(value: FormulaValue | undefined): ErrorCode | undefined {
  return isFormulaError(value) && isFormulaErrorCode(value.code) ? value.code : void 0;
}
