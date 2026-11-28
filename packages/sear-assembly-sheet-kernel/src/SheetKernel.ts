import { ConfigEngine } from '@searsuite/sear-assembly-config';
import {
  Pipeline,
  PipelineStepExecutorRegistry,
  PipelineStepKind,
  Plugin,
  PluginKey,
  PluginManager,
  SearContractViolationError,
  SearPipelineStepExecutorNotFoundError,
  SheetInteractionStore,
  adoptCommittedPluginState,
  warnIfOutsideCommandExecution,
  type PipelineStep,
  type PipelineStepExecutionContext,
  type SheetInteractionSignal,
  type SheetInteractionState,
} from '@searsuite/sear-assembly-plugin';
import { CSRMatrix } from '@searsuite/sear-domain-matrix';
import { getAllActionNames } from '@searsuite/sear-domain-ot';
import { SheetDataEngine, readSheetDataMatrix, type SheetProjectionInvalidation } from '@searsuite/sear-domain-sheet';
import {
  DataEngine,
  StateKernel,
  type DataEngineRegistrationOptions,
  type StateKernelCommit,
} from '@searsuite/sear-domain-state';
import { Transaction } from '@searsuite/sear-domain-transaction';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';
import { Rect } from '@searsuite/sear-foundation-rect';
import { type SheetCommitSnapshot } from './SheetCommitSnapshot';
import { SheetOwnerLifecycle } from './SheetOwnerLifecycle';
import { projectSheetTransaction } from './SheetTransactionProjection';

/** One committed state/effect publication available to independent consumers. */
export type SheetKernelPublication = StateKernelCommit<Plugin<unknown>, Transaction, SheetProjectionInvalidation>;

/** Owns Sheet state reduction, command transactions and publication without presentation services. */
@Injectable()
export class SheetKernel {
  public static readonly symbol: symbol = Symbol.for('SheetKernel');
  public readonly pluginManager: PluginManager;
  public readonly dataEngine: SheetDataEngine;
  public readonly configEngine: ConfigEngine;
  readonly #interactionStore: SheetInteractionStore;
  readonly #stepExecutorRegistry: PipelineStepExecutorRegistry;
  readonly #platform: Platform;
  readonly #kernel: StateKernel<Plugin<unknown>, Transaction, SheetProjectionInvalidation>;
  readonly #ownerLifecycle: SheetOwnerLifecycle;
  readonly #stateCommitToken = {};
  #initialized = false;
  #destroyed = false;
  #commandBoundaryCheck: (() => boolean) | undefined;
  #teardownToken: object | undefined;
  #commitSnapshot: SheetCommitSnapshot = Object.freeze({ revision: 0, changedOwners: Object.freeze([]) });

  constructor(
    @Inject(PluginManager.symbol) manager: PluginManager,
    @Inject(DataEngine.symbol) data: SheetDataEngine,
    @Inject(ConfigEngine.symbol) config: ConfigEngine,
    @Inject(SheetInteractionStore.symbol) interactions: SheetInteractionStore,
    @Inject(PipelineStepExecutorRegistry.symbol) steps: PipelineStepExecutorRegistry,
    @Inject(Platform.symbol) platform: Platform,
    @Inject(SheetOwnerLifecycle.symbol) owners: SheetOwnerLifecycle,
  ) {
    this.pluginManager = manager;
    this.dataEngine = data;
    this.configEngine = config;
    this.#interactionStore = interactions;
    this.#stepExecutorRegistry = steps;
    this.#platform = platform;
    this.#ownerLifecycle = owners;
    this.#kernel = new StateKernel(
      {
        forEachOwner: (transaction, visit) => {
          const allActions = getAllActionNames();
          const actions = new Set<string>();
          for (const operation of transaction.operations)
            for (const key of Object.keys(operation)) if (allActions.has(key)) actions.add(key);
          this.pluginManager.forEach((plugin) => {
            const interests = plugin.interestedIn ?? [];
            if (
              plugin.key === transaction.pluginKey ||
              interests.includes('*') ||
              interests.some((action) => actions.has(action))
            )
              visit(plugin);
          });
        },
        read: (plugin) => plugin.getState(),
        clone: (state) => this.#cloneStagedState(state),
        apply: (plugin, state, transaction) => plugin.apply(state, transaction),
        prepare: (plugin, state) => {
          plugin.lockCommittedState?.(state);
          return adoptCommittedPluginState(state);
        },
        publish: (states) => {
          states.forEach((state, plugin) => {
            plugin.setState(state, this.#stateCommitToken);
            const visible = this.dataEngine.hasDataType(plugin.key);
            if (visible) this.dataEngine.replaceDataType(plugin.key, state, this.#stateCommitToken);
          });
        },
      },
      (error) => this.#warn('Sheet commit listener failed.', error),
    );
    this.#kernel.subscribe((commit) => {
      this.#commitSnapshot = Object.freeze({
        revision: commit.revision,
        changedOwners: Object.freeze([...commit.changes.keys()].map((plugin) => plugin.key.key)),
      });
    });

    this.#registerBuiltInPipelineStepExecutors();
  }
  /** Installs the owning command dispatch boundary. */
  public enforceCommandBoundary(isExecuting: () => boolean): void {
    if (this.#commandBoundaryCheck)
      throw new SearContractViolationError('Sheet command boundary is already installed.');
    this.#commandBoundaryCheck = isExecuting;
  }
  /** Reserves destruction for the owning editor. */
  public enforceTeardownBoundary(token: object): void {
    if (this.#teardownToken) throw new SearContractViolationError('Sheet teardown boundary is already installed.');
    this.#teardownToken = token;
  }
  /** Registers state owners and their initial sparse indexes. */
  public initialize(): void {
    if (this.#initialized || this.#destroyed) return;
    this.#initialized = true;
    const owners = this.pluginManager.getAllPlugins();
    this.#handlePlugin(owners, true);
    this.#processInitialData(owners);
    PluginManager.prototype.enforceWriteBoundary.call(this.pluginManager, this.#stateCommitToken);
  }
  /** Starts lifecycle-owned business subscriptions. */
  public start(): void {
    this.#ownerLifecycle.start();
  }
  /** Reads metadata from the latest delivered publication. */
  public getCommitSnapshot(): SheetCommitSnapshot {
    return this.#commitSnapshot;
  }
  /** Observes immutable commit metadata without subscribing to a view. */
  public subscribeCommits(listener: (snapshot: SheetCommitSnapshot) => void): () => void {
    return this.#kernel.subscribe(() => listener(this.#commitSnapshot));
  }
  /** Attaches an independent committed-state consumer. */
  public subscribePublications(listener: (commit: SheetKernelPublication) => void): () => void {
    return this.#kernel.subscribe(listener);
  }
  /** Releases state publication listeners. */
  public destroy(token?: object): void {
    if (this.#destroyed) return;
    if (this.#teardownToken && token !== this.#teardownToken)
      throw new SearContractViolationError('Sheet kernel destruction requires its editor owner.');
    this.#destroyed = true;
    this.#ownerLifecycle.destroy();
    this.#kernel.destroy();
  }
  /** Reads the committed state of one owner. */
  public getOwnerState(key: PluginKey): unknown {
    return this.pluginManager.getPluginState(key);
  }

  /**
   * Traverses the sparse sheet data once and fans out each stored cell to
   * interested plugins. This keeps startup indexes from independently
   * walking the row-pointer array (or, worse, the entire sheet shape).
   */
  #processInitialData(plugins: Plugin<any>[]): void {
    const hasInitialDataConsumer = plugins.some((plugin) => plugin.onInitialDataCell || plugin.onInitialDataComplete);
    if (!hasInitialDataConsumer) return;

    const sheetData = readSheetDataMatrix(this.dataEngine);
    if (!sheetData) return;

    sheetData.forEachStored((cell, row, col) => {
      plugins.forEach((plugin) => plugin.onInitialDataCell?.(cell, row, col));
    });
    plugins.forEach((plugin) => plugin.onInitialDataComplete?.());
  }

  #handlePlugin(plugins: Plugin<any>[], sealDataEngine = false) {
    plugins.forEach((plugin) => {
      if (plugin.registerConfig) {
        const config = plugin.registerConfig();
        config.map((configUnit) => {
          this.configEngine.registerConfig(configUnit.key, configUnit.config);
        });
      }
    });

    plugins.forEach((plugin) => this.#protectPluginState(plugin));

    plugins.forEach((plugin) => {
      if (plugin.registerState) {
        const stateResult = plugin.registerState();
        const states = Array.isArray(stateResult) ? stateResult : [stateResult];
        states.forEach((s) => {
          const state = s.key === plugin.key ? plugin.getState() : adoptCommittedPluginState(s.state);
          if (s.dataEngine?.enabled === false) return;
          const options: DataEngineRegistrationOptions = {
            ...(s.dataEngine?.dataView !== void 0 ? { dataView: s.dataEngine.dataView } : {}),
          };
          this.dataEngine.registerDataType(s.key, state, options, this.#stateCommitToken);
        });
      }
    });

    if (sealDataEngine) {
      DataEngine.prototype.enforceWriteBoundary.call(this.dataEngine, this.#stateCommitToken);
    }
  }

  #protectPluginState(plugin: Plugin<unknown>): void {
    if (!(plugin instanceof Plugin)) {
      throw new SearContractViolationError('Sheet state owners must extend Plugin.');
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

  /**
   * Stages a pipeline's changes and commits them before notifying subscribers.
   *
   * State-changing steps require an active command when the editor has
   * installed its command boundary. A failure during staging rolls back
   * prepared work and leaves the staged plugin state uncommitted. Successful
   * commits notify plugins before independent consumers receive the publication.
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
      return (
        step.kind !== PipelineStepKind.Invalidate ||
        !!(step.transaction || step.interaction || step.localAction || step.prepare || step.postCommit)
      );
    }
    if (pipeline.steps.some(stepMayChangeState)) assertCommandBoundary();
    warnIfOutsideCommandExecution('SheetKernel.executePipeline', this.#warn);
    pipeline.emitStart();
    const postCommitActions: Array<() => void> = [];
    const stagedRollbackActions: Array<() => void> = [];
    const batch = this.#kernel.begin();
    const committedTransactions: Transaction[] = [];
    const stagedInteractions: SheetInteractionSignal[] = [];
    let stagedInteractionState: Readonly<SheetInteractionState> | null = null;
    const invalidatedProjections = new Set<PluginKey>();
    function executeSheetPipelineTransaction(step: PipelineStep): void {
      if (!step.transaction) return;
      assertCommandBoundary();
      committedTransactions.push(step.transaction);
      batch.stage(step.transaction);
    }
    function executeSheetPipelineRender(step: PipelineStep): void {
      if (!step.projectionKey) return;
      invalidatedProjections.add(step.projectionKey);
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
    const context: PipelineStepExecutionContext = {
      executeTransaction: executeSheetPipelineTransaction,
      invalidateProjection: executeSheetPipelineRender,
      applyInteraction: executeSheetPipelineInteraction,
      runLocalAction: executeSheetPipelineLocalAction,
      prepareLocalAction: prepareSheetPipelineLocalAction,
      schedulePostCommit: scheduleSheetPipelinePostCommit,
    };

    let commit:
      | import('@searsuite/sear-domain-state').StateKernelCommit<
          Plugin<unknown>,
          Transaction,
          SheetProjectionInvalidation
        >
      | undefined;
    function assertCommandBoundaryForBatch(): void {
      if (committedTransactions.length || stagedInteractionState) assertCommandBoundary();
    }
    const explicitSteps = [...pipeline.steps];
    pipeline.steps.length = 0;
    try {
      for (const explicit of explicitSteps) {
        if (stepMayChangeState(explicit)) assertCommandBoundary();
        const prerequisites = explicit.transaction
          ? projectSheetTransaction(this.pluginManager, explicit.transaction, (plugin) => batch.read(plugin))
          : [];
        const steps: PipelineStep[] = [
          ...prerequisites.map((transaction) => ({
            name: `project:${transaction.pluginKey.key}`,
            kind: PipelineStepKind.Transaction,
            transaction,
          })),
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
      assertCommandBoundaryForBatch();
      if (pipeline.steps.length)
        commit = this.#kernel.commit(
          batch,
          Object.freeze({
            projections: Object.freeze([...invalidatedProjections]),
            interactionChanged: stagedInteractions.length > 0,
          }),
        );
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

    try {
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
    } finally {
      // Presentation failures cannot invalidate a successful state commit.
      if (commit) this.#kernel.notify(commit);
    }
    pipeline.emitComplete();
  }

  /** Stages document transactions for a command without publishing their states. */
  public previewTransactionStates(transactions: readonly Transaction[]): ReadonlyMap<PluginKey, unknown> {
    if (this.#commandBoundaryCheck && !this.#commandBoundaryCheck()) {
      throw new SearContractViolationError('Sheet transaction previews must run through editor.commands.run(...).');
    }
    const batch = this.#kernel.begin();
    for (const transaction of transactions) {
      const prerequisites = projectSheetTransaction(this.pluginManager, transaction, (plugin) => batch.read(plugin));
      for (const projected of [...prerequisites, transaction]) batch.stage(projected);
    }
    return new Map([...batch.preview()].map(([plugin, state]) => [plugin.key, state]));
  }

  #registerBuiltInPipelineStepExecutors(): void {
    this.#registerBuiltInPipelineStepExecutor({
      kind: PipelineStepKind.Transaction,
      execute: function executeBuiltInSheetTransactionStep(context, step) {
        context.executeTransaction(step);
      },
    });
    this.#registerBuiltInPipelineStepExecutor({
      kind: PipelineStepKind.Invalidate,
      execute: function executeBuiltInSheetRenderStep(context, step) {
        context.invalidateProjection(step);
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
  }

  #registerBuiltInPipelineStepExecutor(executor: {
    kind: string;
    execute: (context: PipelineStepExecutionContext, step: Pipeline['steps'][number]) => void;
  }): void {
    if (!this.#stepExecutorRegistry.get(executor.kind)) this.#stepExecutorRegistry.register(executor);
  }

  /** Deeply copies a committed state before applying speculative pipeline work. */
  #cloneStagedState<T>(value: T): T {
    if (value === null || typeof value !== 'object') return value;

    if (value instanceof CSRMatrix) return CSRMatrix.prototype.cloneForStaging.call(value) as T;
    if (Object.getPrototypeOf(value) === Rect.prototype) return Rect.prototype.clone.call(value) as T;

    if (Array.isArray(value)) return value.map((item) => this.#cloneStagedState(item)) as T;

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

  #warn = (message: string, ...details: unknown[]): void => {
    this.#platform.warn(message, ...details);
  };
}
