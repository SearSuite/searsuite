import { projectSheetTransaction } from './SheetTransactionProjection';
import { PluginKey, Plugin, PluginManager } from '@searsuite/sear-assembly-plugin';
import { EventEngine, EventWithOffsetAndTarget, getPluginHandlerName } from '@searsuite/sear-render-event-engine';
import { Injectable } from '@searsuite/sear-foundation-di';
import { SceneGraph, Tree } from '@searsuite/sear-render-node';
import { Inject } from '@searsuite/sear-foundation-di';
import {
  RenderEngine,
  readSheetColumnSizes,
  readSheetRowSizes,
  readSheetDataMatrix,
  type DataEngineRegistrationOptions,
} from '@searsuite/sear-render-engine';
import { SearCore } from './SearCore';
import { Transaction } from '@searsuite/sear-domain-transaction';
import { Pipeline, PipelineStepKind, PipelineLifecycle, type PipelineStep } from './Pipeline';
import { ConfigEngine, type SheetConfig } from '@searsuite/sear-assembly-config';
import { DataEngine, SheetDataEngine } from '@searsuite/sear-render-engine';
import { CellProperties, SheetRenderCoordinatorManager } from '@searsuite/sear-render-registry';
import { getAllActionNames } from '@searsuite/sear-domain-ot';
import { CSRMatrix } from '@searsuite/sear-domain-matrix';
import { ScrollManager, type ScrollManagerState } from '@searsuite/sear-render-scroll';
import { PositionRect, Rect } from '@searsuite/sear-foundation-rect';
import { SearError } from '@searsuite/sear-foundation-error';
import { HexColor } from '@searsuite/sear-foundation-utils';
import { Platform } from '@searsuite/sear-foundation-platform';
import { SheetLifecycleCoordinator } from './SheetLifecycleCoordinator';
import {
  SheetInteractionStore,
  type SheetInteractionSignal,
  type SheetInteractionState,
} from './SheetInteractionStore';
import { PipelineStepExecutorRegistry, type PipelineStepExecutionContext } from './PipelineStepExecutorRegistry';
import { SearContractViolationError, SearPipelineStepExecutorNotFoundError } from './errors/SearAssemblyError';
import { warnIfOutsideCommandExecution } from './CommandExecutionScope';
import { adoptCommittedPluginState } from './adoptCommittedPluginState';

/** A plugin state value staged privately while a pipeline is being evaluated. */
interface StagedPluginState {
  /** Plugin that owns the prospective state. */
  readonly plugin: Plugin<SearCoreSheet, CellProperties, unknown>;
  /** Prospective state, isolated from the committed plugin state. */
  state: unknown;
  /** Whether the state is visible through DataEngine after commit. */
  readonly dataEngineVisible: boolean;
}

/**
 * Sheet runtime that coordinates plugin state, transactions, rendering, and input.
 *
 * An assembled editor owns one core. Feature commands submit pipelines to it;
 * the core stages plugin-owned changes, commits them together, notifies
 * transaction listeners, and refreshes the affected scene. Application code
 * should enter state changes through the editor's command bus.
 */
@Injectable()
export class SearCoreSheet extends SearCore<SearCoreSheet, CellProperties, SheetRenderCoordinatorManager> {
  readonly #lifecycleCoordinator: SheetLifecycleCoordinator;
  readonly #interactionStore: SheetInteractionStore;
  readonly #stepExecutorRegistry: PipelineStepExecutorRegistry;
  readonly #platform: Platform | undefined;

  // protected pluginManager: PluginManager<SearCoreSheet>;
  protected renderStage: SceneGraph<CellProperties>;
  /** Data registry for plugin-owned sheet state. */
  public dataEngine!: DataEngine;
  /** Event pipeline and hit-testing facade for sheet interactions. */
  public eventEngine!: EventEngine<CellProperties>;
  /** Render pipeline facade for visible sheet scene updates. */
  public renderEngine!: RenderEngine<CellProperties, SheetRenderCoordinatorManager>;
  /** Configuration registry used by sheet plugins. */
  public configEngine!: ConfigEngine;
  /** Ordered plugin registry for this sheet runtime. */
  public readonly pluginManager!: PluginManager<SearCoreSheet, CellProperties>;
  #stopScrollReRender: (() => void) | undefined;
  #scrollRenderFrame: number | null = null;
  #sheetBoundarySize: { width: number; height: number; viewportWidth: number; viewportHeight: number } | null = null;
  #initialized = false;
  #started = false;
  #destroyed = false;
  #commandBoundaryCheck: (() => boolean) | undefined;
  #teardownToken: object | undefined;
  readonly #stateCommitToken = {};

  /** Permanently require command dispatch for state-changing pipelines in an assembled editor. */
  public enforceCommandBoundary(isCommandExecuting: () => boolean): void {
    if (this.#commandBoundaryCheck) throw new SearContractViolationError('Sheet command boundary is already installed.');
    this.#commandBoundaryCheck = isCommandExecuting;
    for (const key of [
      'renderStage', 'dataEngine', 'eventEngine', 'renderEngine', 'configEngine',
      'lifecycleCoordinator', 'interactionStore', 'stepExecutorRegistry', 'platform',
    ]) Object.defineProperty(this, key, { writable: false, configurable: false });
  }

  /** Reserves assembled runtime teardown for the owning editor facade. */
  public enforceTeardownBoundary(token: object): void {
    if (this.#teardownToken) throw new SearContractViolationError('Sheet teardown boundary is already installed.');
    this.#teardownToken = token;
    ScrollManager.prototype.enforceTeardownBoundary.call(this.renderEngine.scrollManager, token);
  }

  /** Creates a sheet core from the DI-provided runtime services. */
  constructor(
    @Inject(SceneGraph.symbol) stage: SceneGraph<CellProperties>,
    // Plugin manager
    @Inject(PluginManager.symbol)
    pluginManager: PluginManager<SearCoreSheet, CellProperties>,
    // Data engine
    @Inject(DataEngine.symbol) dataEngine: SheetDataEngine,
    // Render engine
    @Inject(RenderEngine.symbol)
    renderEngine: RenderEngine<CellProperties, SheetRenderCoordinatorManager>,
    // Event engine
    @Inject(EventEngine.symbol) eventEngine: EventEngine<CellProperties>,
    // Config engine
    @Inject(ConfigEngine.symbol) configEngine: ConfigEngine,
    @Inject(SheetLifecycleCoordinator.symbol)
    lifecycleCoordinator: SheetLifecycleCoordinator,
    @Inject(SheetInteractionStore.symbol)
    interactionStore: SheetInteractionStore,
    @Inject(PipelineStepExecutorRegistry.symbol)
    stepExecutorRegistry: PipelineStepExecutorRegistry,
    @Inject(Platform.symbol)
    platform?: Platform,
  ) {
    super();
    this.#lifecycleCoordinator = lifecycleCoordinator;
    this.#interactionStore = interactionStore;
    this.#stepExecutorRegistry = stepExecutorRegistry;
    this.#platform = platform;
    this.renderStage = stage;
    Object.defineProperty(this, 'pluginManager', { value: pluginManager, writable: false, configurable: false });
    this.renderEngine = renderEngine;
    this.eventEngine = eventEngine;
    this.configEngine = configEngine;
    this.dataEngine = dataEngine;
    this.#registerBuiltInPipelineStepExecutors();
  }

  /** Returns the render engine bound to this sheet core. */
  public getRenderEngine() {
    return this.renderEngine;
  }

  /** Returns the sheet data engine with sheet-specific helpers. */
  public getDataEngine() {
    return this.dataEngine as SheetDataEngine;
  }

  /** Returns the scene graph used by render and event strategies. */
  public getStage() {
    return this.renderStage;
  }

  /** Returns state owned by the plugin identified by the given key. */
  public getPlugin(pluginKey: PluginKey) {
    return this.pluginManager.getPluginState(pluginKey);
  }

  /** Builds plugin state and initial scene nodes without starting runtime effects. */
  public override initialize(): void {
    if (this.#initialized || this.#destroyed) return;
    this.#initialized = true;
    const buildInPlugins = this.pluginManager.getAllPlugins();
    this.#handlePlugin(buildInPlugins, true);
    this.#processInitialData(buildInPlugins);
    this.#expandTreeBoundaryToSheetSize();
    if (this.#commandBoundaryCheck) {
      PluginManager.prototype.enforceWriteBoundary.call(this.pluginManager, this.#stateCommitToken);
    }
  }

  /** Starts rendering, events, and lifecycle-owned runtime controllers. */
  public start(): void {
    if (this.#started || this.#destroyed) return;
    if (!this.#initialized) this.initialize();
    this.#started = true;
    this.renderEngine.render(this.renderStage);
    this.eventEngine.render(this.renderStage);

    // Refresh boundaries after the first render in case a renderer contributed
    // dimensions during startup. initialize() already establishes them before
    // session viewport restoration so the first frame cannot clamp restored state.
    this.#expandTreeBoundaryToSheetSize();
    this.#lifecycleCoordinator.start({
      core: this,
      refreshSheetBoundaries: this.#expandTreeBoundaryToSheetSize.bind(this),
    });

    // Viewport-culled plugins need to regenerate their scene nodes when the
    // viewport changes. This subscriber runs before the render strategies so
    // new cells are in the QuadTree when strategies query it.
    this.#stopScrollReRender = this.renderEngine.scrollManager.subscribeScroll(
      this.#handleScrollReRender.bind(this),
      true,
    );
  }

  /** Releases runtime controllers and their subscriptions owned by this sheet. */
  public destroy(token?: object): void {
    if (this.#destroyed) return;
    if (this.#teardownToken && token !== this.#teardownToken) {
      throw new SearContractViolationError('Sheet core destruction requires its editor owner.');
    }
    this.#destroyed = true;
    this.#stopScrollReRender?.();
    this.#stopScrollReRender = void 0;
    if (this.#scrollRenderFrame !== null) this.#platform?.cancelAnimationFrame(this.#scrollRenderFrame);
    this.#scrollRenderFrame = null;
    this.eventEngine.destroy(token);
    this.#lifecycleCoordinator.destroy();
    this.renderEngine.scrollManager.destroy(token);
  }

  /**
   * Traverses the sparse sheet data once and fans out each stored cell to
   * interested plugins. This keeps startup indexes from independently
   * walking the row-pointer array (or, worse, the entire sheet shape).
   */
  #processInitialData(plugins: Plugin<SearCoreSheet, CellProperties, any>[]): void {
    const hasInitialDataConsumer = plugins.some((plugin) => plugin.onInitialDataCell || plugin.onInitialDataComplete);
    if (!hasInitialDataConsumer) return;

    const sheetData = readSheetDataMatrix(this.dataEngine);
    if (!sheetData) return;

    sheetData.forEachStored((cell, row, col) => {
      plugins.forEach((plugin) => plugin.onInitialDataCell?.(this, cell, row, col));
    });
    plugins.forEach((plugin) => plugin.onInitialDataComplete?.(this));
  }

  #handlePlugin(plugins: Plugin<SearCoreSheet, CellProperties, any>[], sealDataEngine = false) {
    plugins.forEach((plugin) => {
      if (plugin.registerConfig) {
        const config = plugin.registerConfig();
        config.map((configUnit) => {
          this.configEngine.registerPluginConfig(configUnit.key, configUnit.config);
        });
      }
    });

    plugins.forEach((plugin) => this.#protectPluginState(plugin));

    plugins.forEach((plugin) => {
      if (plugin.registerState) {
        const stateResult = plugin.registerState();
        const states = Array.isArray(stateResult) ? stateResult : [stateResult];
        states.forEach((s) => {
          const state = plugin instanceof Plugin && s.key === plugin.key
            ? plugin.getState() : adoptCommittedPluginState(s.state);
          if (s.dataEngine?.enabled === false) return;
          const options: DataEngineRegistrationOptions = {
            ...(s.dataEngine?.dataView !== void 0 ? { dataView: s.dataEngine.dataView } : {}),
          };
          this.dataEngine.registerDataType(s.key, state, options, this.#stateCommitToken);
        });
      }
    });

    if (sealDataEngine) {
      if (this.dataEngine instanceof DataEngine) {
        DataEngine.prototype.enforceWriteBoundary.call(this.dataEngine, this.#stateCommitToken);
      } else (this.dataEngine as unknown as DataEngine).enforceWriteBoundary(this.#stateCommitToken);
    }

    plugins.forEach((plugin) => {
      if (plugin.render) {
        const shapes = plugin.render(this) || [];
        this.getStage().addPluginNode(plugin.key.key, shapes);
      }

      this.#registerPluginEvents(plugin);
    });
  }

  #registerPluginEvents(plugin: Plugin<SearCoreSheet, CellProperties, unknown>) {
    const {
      eventEngine: {
        eventRegistrar: { registeredEvents },
      },
    } = this;
    registeredEvents.forEach((eventName) => {
      const handlerName = getPluginHandlerName(eventName);
      const candidate = Reflect.get(plugin, handlerName);
      if (typeof candidate === 'function') {
        const handler = candidate as (
          core: SearCoreSheet,
          event: EventWithOffsetAndTarget<CellProperties>,
        ) => boolean | void;
        const core = this;
        this.eventEngine.registerEvent(
          eventName,
          function forwardPluginSheetEvent(event: EventWithOffsetAndTarget<CellProperties>): boolean | void {
            // Forward the plugin return value directly.
            // When a plugin returns `false`, EventListener.emit stops propagation to later plugins.
            return handler.call(plugin, core, event);
          },
        );
      }
    });
  }

  /** Registers and initializes a plugin after core startup. */
  public registerPlugin<T>(plugin: Plugin<SearCoreSheet, CellProperties, T>) {
    if (this.#commandBoundaryCheck && !this.#commandBoundaryCheck()) {
      throw new SearContractViolationError('Sheet plugin registration must run through editor.commands.run(...).');
    }
    this.#handlePlugin([plugin]);
  }

  #protectPluginState(plugin: Plugin<SearCoreSheet, CellProperties, unknown>): void {
    if (!(plugin instanceof Plugin)) {
      if (this.#commandBoundaryCheck) throw new SearContractViolationError('Sheet state owners must extend Plugin.');
      return;
    }
    if (plugin.getState !== Plugin.prototype.getState || plugin.setState !== Plugin.prototype.setState) {
      throw new SearContractViolationError('Sheet plugins must use the guarded Plugin state accessors.');
    }
    const initialState = plugin.getState();
    plugin.lockCommittedState?.(initialState);
    Plugin.prototype.setState.call(plugin, adoptCommittedPluginState(initialState));
    Plugin.prototype.enforceStateWriteBoundary.call(plugin, this.#stateCommitToken);
    Plugin.prototype.sealRuntimeMetadata.call(plugin);
    const key = plugin.key;
    Object.defineProperties(plugin, {
      pluginKey: { value: key, writable: false, configurable: false },
      key: { get: () => key, configurable: false },
      getState: { value: Plugin.prototype.getState, writable: false, configurable: false },
      setState: { value: Plugin.prototype.setState, writable: false, configurable: false },
    });
  }

  // ─── Unified Pipeline execution ────────────────────────────────────
  //
  // Every state mutation or render trigger flows through Pipeline so
  // the full operation is observable (logged, named, traceable).
  // Public user and host operations must enter through SheetCommandBus.

  /**
   * Convenience: wrap a render-only refresh in a Pipeline and execute it.
   */
  public requestRender<T>(plugin: Plugin<SearCoreSheet, CellProperties, T>) {
    this.executePipeline(Pipeline.fromRender(`render:${plugin.key.key}`, plugin.key));
  }

  /** Rebuilds viewport-culled nodes and both render layers after a view-scale change. */
  public refreshViewport(): void {
    if (this.#destroyed) return;
    this.#expandTreeBoundaryToSheetSize();
    this.renderEngine.invalidateScreenCache();
    this.#rebuildViewportNodes();
    this.renderEngine.render(this.renderStage);
    this.eventEngine.renderImmediate(this.renderStage);
  }

  /**
   * Stages a pipeline's changes and commits them before rendering.
   *
   * State-changing steps require an active command when the editor has
   * installed its command boundary. A failure during staging rolls back
   * prepared work and leaves the staged plugin state uncommitted. Successful
   * commits notify plugins before the affected scene is rendered.
   */
  public executePipeline(pipeline: Pipeline): void {
    const core = this;
    function assertCommandBoundary(): void {
      if (core.#commandBoundaryCheck && !core.#commandBoundaryCheck()) {
        throw new SearContractViolationError('Sheet state changes must run through editor.commands.run(...).', {
          pipeline: pipeline.name,
        });
      }
    }
    function stepMayChangeState(step: PipelineStep): boolean {
      return (step.kind !== PipelineStepKind.Render && step.kind !== PipelineStepKind.PostRender) ||
        !!(step.transaction || step.interaction || step.localAction || step.prepare || step.postCommit);
    }
    if (pipeline.steps.some(stepMayChangeState)) assertCommandBoundary();
    warnIfOutsideCommandExecution('SearCoreSheet.executePipeline', this.#warn);
    pipeline.emitStart();
    let needsRender = false;
    const postRenderSteps: typeof pipeline.steps = [];
    const postCommitActions: Array<() => void> = [];
    const stagedRollbackActions: Array<() => void> = [];
    const stagedPluginStates = new Map<PluginKey, StagedPluginState>();
    const changedTransactions = new Map<Plugin<SearCoreSheet, CellProperties, unknown>, Transaction[]>();
    const committedTransactions: Transaction[] = [];
    const stagedInteractions: SheetInteractionSignal[] = [];
    let stagedInteractionState: Readonly<SheetInteractionState> | null = null;
    const renderPlugins = new Set<PluginKey>();
    function executeSheetPipelineTransaction(step: PipelineStep): void {
      if (!step.transaction) return;
      assertCommandBoundary();
      committedTransactions.push(step.transaction);
      if (core.#stageTransaction(step.transaction, stagedPluginStates, changedTransactions)) needsRender = true;
    }
    function executeSheetPipelineRender(step: PipelineStep): void {
      if (!step.renderPluginKey) return;
      renderPlugins.add(step.renderPluginKey);
      needsRender = true;
    }
    function executeSheetPipelineInteraction(step: PipelineStep): void {
      if (!step.interaction) return;
      assertCommandBoundary();
      stagedInteractionState = core.#interactionStore.reduce(
        stagedInteractionState ?? core.#interactionStore.getState(),
        step.interaction,
      );
      stagedInteractions.push(step.interaction);
    }
    function executeSheetPipelineLocalAction(step: PipelineStep): void {
      if (step.localAction) {
        assertCommandBoundary();
        step.localAction();
      }
    }
    function prepareSheetPipelineLocalAction(step: PipelineStep): void {
      if (step.prepare) {
        assertCommandBoundary();
        stagedRollbackActions.push(step.prepare());
      }
    }
    function scheduleSheetPipelinePostCommit(step: PipelineStep): void {
      if (step.postCommit) {
        assertCommandBoundary();
        postCommitActions.push(step.postCommit);
      }
    }
    function executeSheetPipelinePostRender(step: PipelineStep): void {
      postRenderSteps.push(step);
    }
    function markSheetPipelineDirty(rect: PositionRect<HexColor>): void {
      core.renderEngine.markDirty(rect);
    }
    const context: PipelineStepExecutionContext = {
      executeTransaction: executeSheetPipelineTransaction,
      renderPlugin: executeSheetPipelineRender,
      applyInteraction: executeSheetPipelineInteraction,
      runLocalAction: executeSheetPipelineLocalAction,
      prepareLocalAction: prepareSheetPipelineLocalAction,
      schedulePostCommit: scheduleSheetPipelinePostCommit,
      schedulePostRender: executeSheetPipelinePostRender,
      markDirty: markSheetPipelineDirty,
    };

    const explicitSteps = [...pipeline.steps];
    pipeline.steps.length = 0;
    try {
      for (const explicit of explicitSteps) {
        if (stepMayChangeState(explicit)) assertCommandBoundary();
        const prerequisites = explicit.transaction
          ? projectSheetTransaction(this.pluginManager, explicit.transaction, (plugin) =>
              stagedPluginStates.get(plugin.key)?.state ?? plugin.getState())
          : [];
        const steps: PipelineStep[] = [
          ...prerequisites.map((transaction) => ({ name: `project:${transaction.pluginKey.key}`, kind: PipelineStepKind.Transaction, transaction })),
          explicit,
        ];
        for (const step of steps) {
          pipeline.steps.push(step);
          pipeline.emitStepStart(step);
          if (stepMayChangeState(step)) assertCommandBoundary();
          const executor = this.#stepExecutorRegistry.get(step.kind);
          if (!executor) throw new SearPipelineStepExecutorNotFoundError(step.kind);
          executor.execute(context, step);
          pipeline.emitStepComplete(step);
        }
      }
      if (stagedPluginStates.size || stagedInteractionState) assertCommandBoundary();
      this.#commitStagedPluginStates(stagedPluginStates);
      if (stagedInteractionState) this.#interactionStore.commit(stagedInteractionState, stagedInteractions);
    } catch (error) {
      stagedRollbackActions.reverse().forEach((rollback) => {
        try {
          rollback();
        } catch (rollbackError) {
          this.#warn(`Sheet pipeline ${pipeline.name} preparation rollback failed.`, rollbackError);
        }
      });
      throw error;
    }

    postCommitActions.forEach((commit) => {
      assertCommandBoundary();
      try {
        commit();
      } catch (error) {
        this.#warn(`Sheet pipeline ${pipeline.name} post-commit action failed.`, error);
      }
    });
    committedTransactions.forEach((transaction) => {
      this.pluginManager.forEach((plugin) => {
        try {
          plugin.onTransactionCommitted?.(transaction);
        } catch (error) {
          this.#warn('Sheet plugin transaction listener failed.', error);
        }
      });
    });

    if (changedTransactions.size) this.#expandTreeBoundaryToSheetSize();

    if (this.#renderCommittedTransactions(changedTransactions, renderPlugins)) needsRender = true;
    for (const rect of pipeline.dirtyRects) {
      this.renderEngine.markDirty(rect);
    }

    if (needsRender) {
      this.renderEngine.render(this.renderStage);
      this.eventEngine.render(this.renderStage);
    }
    if (postRenderSteps.length) {
      for (const step of postRenderSteps) {
        this.pluginManager.forEach((plugin) => {
          if (plugin.key !== step.renderPluginKey) return;
          const shapes = plugin.render(this) || [];
          this.getStage().addPluginNode(plugin.key.key, shapes);
        });
      }
      this.renderEngine.render(this.renderStage);
      this.eventEngine.render(this.renderStage);
      needsRender = true;
    }
    pipeline.emitComplete(needsRender);
  }

  /** Stages document transactions for a command without publishing their states. */
  public previewTransactionStates(transactions: readonly Transaction[]): ReadonlyMap<PluginKey, unknown> {
    if (this.#commandBoundaryCheck && !this.#commandBoundaryCheck()) {
      throw new SearContractViolationError('Sheet transaction previews must run through editor.commands.run(...).');
    }
    const staged = new Map<PluginKey, StagedPluginState>();
    const changed = new Map<Plugin<SearCoreSheet, CellProperties, unknown>, Transaction[]>();
    for (const transaction of transactions) {
      const prerequisites = projectSheetTransaction(this.pluginManager, transaction, (plugin) =>
        staged.get(plugin.key)?.state ?? plugin.getState());
      for (const projected of [...prerequisites, transaction]) {
        this.#stageTransaction(projected, staged, changed);
      }
    }
    return new Map([...staged].map(([key, value]) => [key, value.state]));
  }

  #registerBuiltInPipelineStepExecutors(): void {
    this.#registerBuiltInPipelineStepExecutor({
      kind: PipelineStepKind.Transaction,
      execute: function executeBuiltInSheetTransactionStep(context, step) {
        context.executeTransaction(step);
      },
    });
    this.#registerBuiltInPipelineStepExecutor({
      kind: PipelineStepKind.Render,
      execute: function executeBuiltInSheetRenderStep(context, step) {
        context.renderPlugin(step);
      },
    });
    this.#registerBuiltInPipelineStepExecutor({
      kind: PipelineStepKind.Interaction,
      execute: function executeBuiltInSheetInteractionStep(context, step) {
        context.applyInteraction(step);
      },
    });
    this.#registerBuiltInPipelineStepExecutor({
      kind: PipelineStepKind.LocalAction,
      execute: function executeBuiltInSheetLocalActionStep(context, step) {
        context.runLocalAction(step);
      },
    });
    this.#registerBuiltInPipelineStepExecutor({
      kind: PipelineStepKind.PreparedAction,
      execute: function prepareBuiltInSheetLocalActionStep(context, step) {
        context.prepareLocalAction!(step);
      },
    });
    this.#registerBuiltInPipelineStepExecutor({
      kind: PipelineStepKind.PostCommit,
      execute: function scheduleBuiltInSheetPostCommitStep(context, step) {
        context.schedulePostCommit(step);
      },
    });
    this.#registerBuiltInPipelineStepExecutor({
      kind: PipelineStepKind.PostRender,
      execute: function executeBuiltInSheetPostRenderStep(context, step) {
        context.schedulePostRender(step);
      },
    });
  }

  #registerBuiltInPipelineStepExecutor(executor: {
    kind: string;
    execute: (context: PipelineStepExecutionContext, step: Pipeline['steps'][number]) => void;
  }): void {
    if (!this.#stepExecutorRegistry.get(executor.kind)) this.#stepExecutorRegistry.register(executor);
  }

  /**
   * Applies one transaction to private state copies and records the plugins
   * whose committed state will need a scene refresh.
   * @param tx - Transaction to evaluate.
   * @param stagedPluginStates - Prospective plugin state by key.
   * @param changedTransactions - Transactions that changed each plugin.
   * @returns True when at least one plugin produced a prospective state.
   */
  #stageTransaction(
    tx: Transaction,
    stagedPluginStates: Map<PluginKey, StagedPluginState>,
    changedTransactions: Map<Plugin<SearCoreSheet, CellProperties, unknown>, Transaction[]>,
  ): boolean {
    let changed = false;
    const allActions = getAllActionNames();
    const txActions = new Set<string>();
    for (const op of tx.operations) {
      for (const key of Object.keys(op)) if (allActions.has(key)) txActions.add(key);
    }
    this.pluginManager.forEach((plugin) => {
      const isOwn = tx.pluginKey === plugin.key;
      if (!isOwn) {
        const interests = plugin.interestedIn ?? [];
        const dominated = interests.includes('*') || interests.some((action) => txActions.has(action));
        if (!dominated) return;
      }
      const staged = stagedPluginStates.get(plugin.key);
      const committedState = plugin.getState?.() ?? this.dataEngine.getDataType(plugin.key);
      const previousState = staged?.state ?? this.#cloneStagedState(committedState);
      const nextState = plugin.apply(previousState, tx);
      if (nextState === null) return;
      stagedPluginStates.set(plugin.key, {
        plugin,
        state: nextState,
        dataEngineVisible:
          staged?.dataEngineVisible ??
          (typeof this.dataEngine.hasDataType === 'function'
            ? this.dataEngine.hasDataType(plugin.key)
            : this.dataEngine.getDataType(plugin.key) !== void 0),
      });
      const transactions = changedTransactions.get(plugin) ?? [];
      transactions.push(tx);
      changedTransactions.set(plugin, transactions);
      changed = true;
    });
    return changed;
  }

  /** Commits every successfully staged plugin state to its owner and data view. */
  #commitStagedPluginStates(stagedPluginStates: ReadonlyMap<PluginKey, StagedPluginState>): void {
    stagedPluginStates.forEach((staged) => {
      staged.plugin.lockCommittedState?.(staged.state);
      staged.state = adoptCommittedPluginState(staged.state);
    });
    stagedPluginStates.forEach(({ plugin, state, dataEngineVisible }) => {
      plugin.setState?.(state, this.#stateCommitToken);
      if (dataEngineVisible) this.dataEngine.replaceDataType?.(plugin.key, state, this.#stateCommitToken);
    });
  }

  /** Refreshes nodes and dirty regions only after prospective state has committed. */
  #renderCommittedTransactions(
    changedTransactions: ReadonlyMap<Plugin<SearCoreSheet, CellProperties, unknown>, readonly Transaction[]>,
    renderPlugins: ReadonlySet<PluginKey>,
  ): boolean {
    const pluginsToRender = new Set<Plugin<SearCoreSheet, CellProperties, unknown>>();
    changedTransactions.forEach((transactions, plugin) => {
      transactions.forEach((transaction) => {
        const dirty = plugin.dirtyRect?.(this, transaction);
        if (dirty) this.renderEngine.markDirty(dirty as PositionRect<HexColor>);
        else pluginsToRender.add(plugin);
      });
    });
    this.pluginManager.forEach((plugin) => {
      if (renderPlugins.has(plugin.key)) pluginsToRender.add(plugin);
    });
    pluginsToRender.forEach((plugin) => {
      const shapes = plugin.render?.(this) || [];
      this.getStage().addPluginNode(plugin.key.key, shapes);
    });
    return pluginsToRender.size > 0 || changedTransactions.size > 0;
  }

  /** Deeply copies a committed state before applying speculative pipeline work. */
  #cloneStagedState<T>(value: T): T {
    if (value === null || typeof value !== 'object') return value;

    if (value instanceof CSRMatrix) return CSRMatrix.prototype.cloneForStaging.call(value) as T;
    if (Object.getPrototypeOf(value) === Rect.prototype) return Rect.prototype.clone.call(value) as T;

    const cloneable = value as { clone?: () => unknown };
    if (typeof cloneable.clone === 'function') {
      const copy = cloneable.clone();
      if (copy === value) throw new SearError('Staged state clone must return an independent value.');
      return copy as T;
    }

    if (Array.isArray(value)) return value.map((item) => this.#cloneStagedState(item)) as T;

    if (value instanceof Map) {
      const cloned = new Map<unknown, unknown>();
      value.forEach((mapValue, mapKey) => {
        cloned.set(this.#cloneStagedState(mapKey), this.#cloneStagedState(mapValue));
      });
      return cloned as T;
    }

    if (value instanceof Set) {
      const cloned = new Set<unknown>();
      value.forEach((setValue) => cloned.add(this.#cloneStagedState(setValue)));
      return cloned as T;
    }

    const prototype = Object.getPrototypeOf(value) as object | null;
    const clonedObject = Object.create(prototype) as Record<PropertyKey, unknown>;
    Reflect.ownKeys(value).forEach((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor) return;
      if ('value' in descriptor) {
        descriptor.value = this.#cloneStagedState(descriptor.value);
        descriptor.writable = true;
      }
      descriptor.configurable = true;
      Object.defineProperty(clonedObject, key, descriptor);
    });
    return clonedObject as T;
  }

  /**
   * Scroll-driven re-render: regenerate viewport-culled plugin nodes
   * when the scroll position changes.  ScrollManager.update() clamps
   * the position before notifying subscribers, so getState() already
   * returns the correct clamped position — computeViewportRange()
   * inside each plugin.render() works correctly.
   */
  #handleScrollReRender(_scrollState: ScrollManagerState): void {
    if (this.#scrollRenderFrame !== null) return;
    if (!this.#platform) {
      this.#renderScrollFrame();
      return;
    }
    this.#scrollRenderFrame = this.#platform.requestAnimationFrame(this.#runScheduledScrollRender.bind(this));
  }

  #runScheduledScrollRender(): void {
    this.#scrollRenderFrame = null;
    this.#renderScrollFrame();
  }

  /** Rebuilds viewport-culled nodes and paints one visual frame for the latest scroll position. */
  #renderScrollFrame(): void {
    if (this.#destroyed) return;
    warnIfOutsideCommandExecution('SearCoreSheet.renderScrollFrame', this.#warn);
    // A command may paint the old scene after committing the scroll position,
    // consuming the scroll delta before this scheduled scene rebuild runs.
    // Repaint the rebuilt nodes even when the raster cache now looks current.
    if (this.renderEngine.scrollManager.hasUnrenderedScroll?.() === false) {
      this.renderEngine.invalidateScreenCache();
    }
    this.#rebuildViewportNodes();

    this.renderEngine.render(this.renderStage);

    // Viewport-culling creates new hit colors, but wheel events can arrive
    // faster than frames.  Rebuild the hit layer once for the newest scene
    // in the next frame instead of once for every wheel event.
    this.eventEngine.renderHitOnNextFrame(this.renderStage);
  }

  #rebuildViewportNodes(): void {
    this.pluginManager.forEach((plugin) => {
      if (!plugin.render) return;
      const shapes = plugin.render(this) || [];
      this.renderStage.addPluginNode(plugin.key.key, shapes, { markDirty: false });
    });
  }

  /**
   * Expand the spatial tree boundary and ScrollManager content boundary
   * to cover the full sheet dimensions.
   *
   * - Tree boundary: prevents RenderStrategy.handleScroll from clamping
   *   scroll position to the viewport-sized QuadTree boundary.
   * - Content boundary: ScrollManager.update() uses it to clamp the
   *   scroll position, ensuring getState() always returns the actual
   *   position. This makes ScrollManager the single source of truth.
   */
  #expandTreeBoundaryToSheetSize(): void {
    const rowSizes = readSheetRowSizes(this.dataEngine);
    const columnSizes = readSheetColumnSizes(this.dataEngine);
    if (!rowSizes || !columnSizes) return;

    const totalWidth = columnSizes.getDimensionRightBoundaryByIndex(columnSizes.shape[1] - 1);
    const totalHeight = rowSizes.getDimensionRightBoundaryByIndex(rowSizes.shape[1] - 1);
    const [viewportWidth, viewportHeight] = this.renderEngine.scrollManager.getShape();
    const previous = this.#sheetBoundarySize;
    if (previous?.width === totalWidth && previous.height === totalHeight &&
      previous.viewportWidth === viewportWidth && previous.viewportHeight === viewportHeight) return;

    // Expand QuadTree boundary
    const tree = this.renderStage['positionRectStorage'] as Tree<PositionRect<HexColor>>;
    if (tree) {
      const currentBoundary = tree.getBoundary();
      const fullBoundary = new PositionRect<HexColor>(
        currentBoundary.x,
        currentBoundary.y,
        Math.max(currentBoundary.width, totalWidth),
        Math.max(currentBoundary.height, totalHeight),
      );
      tree.updateBoundary(fullBoundary);
      this.#sheetBoundarySize = { width: totalWidth, height: totalHeight, viewportWidth, viewportHeight };
    }

    // Set ScrollManager content boundary so that update() clamps correctly.
    // Scroll offsets are measured in sheet-content coordinates, while the
    // viewport also contains sticky row/column headers.
    const defaultConfig = this.configEngine.getDefaultConfig?.() as Partial<SheetConfig> | undefined;
    const sheetOffsetX = defaultConfig?.sheetOffsetX ?? 50;
    const sheetOffsetY = defaultConfig?.sheetOffsetY ?? 24;
    const viewportContentWidth = Math.max(viewportWidth - sheetOffsetX, 0);
    const viewportContentHeight = Math.max(viewportHeight - sheetOffsetY, 0);
    this.renderEngine.scrollManager.setContentBoundary(
      Math.max(totalWidth - viewportContentWidth, 0),
      Math.max(totalHeight - viewportContentHeight, 0),
    );
  }

  #warn = (message: string, ...details: unknown[]): void => {
    this.#platform?.warn?.(message, ...details);
  };
}
