import { ConfigEngine } from '@searsuite/sear-assembly-config';
import { DocInputPlugin, adoptCommittedDocInputState, type DocInputState } from '@searsuite/sear-assembly-doc';
import {
  Pipeline,
  PipelineStepExecutorRegistry,
  PipelineStepKind,
  Plugin,
  PluginKey,
  PluginManager,
  SearContractViolationError,
  SearPipelineStepExecutorNotFoundError,
  adoptCommittedPluginState,
  runOutsideCommandExecution,
  warnIfOutsideCommandExecution,
  type PipelineStep,
  type PipelineStepExecutionContext,
} from '@searsuite/sear-assembly-plugin';
import { CSRMatrix } from '@searsuite/sear-domain-matrix';
import { StateKernel } from '@searsuite/sear-domain-state';
import { type Transaction } from '@searsuite/sear-domain-transaction';
import { SearError } from '@searsuite/sear-foundation-error';
import { type Platform } from '@searsuite/sear-foundation-platform';
import { Rect } from '@searsuite/sear-foundation-rect';
import {
  type DocCommitSnapshot,
  type DocKernelPublication,
  type DocProjectionInvalidation,
} from './DocKernelPublication';

/** Owns document state reduction and committed publications without rendering or native input. */
export class DocKernel {
  public static readonly symbol = Symbol.for('DocKernel');
  public readonly pluginManager: PluginManager;
  public readonly configEngine: ConfigEngine | null;
  readonly #steps: PipelineStepExecutorRegistry;
  readonly #platform: Platform | null;
  readonly #kernel: StateKernel<Plugin<unknown>, Transaction, DocProjectionInvalidation>;
  readonly #stateCommitToken = {};
  #initialized = false;
  #destroyed = false;
  #commandBoundaryCheck: (() => boolean) | undefined;
  #runWithoutMutationAuthority: <Value>(callback: () => Value) => Value = runOutsideCommandExecution;
  #teardownToken: object | undefined;
  #commitSnapshot: DocCommitSnapshot = Object.freeze({ revision: 0, changedOwners: Object.freeze([]) });

  /** Creates the state owner over editor-local business services. */
  constructor(
    manager: PluginManager,
    steps: PipelineStepExecutorRegistry,
    config: ConfigEngine | null = null,
    platform: Platform | null = null,
  ) {
    this.pluginManager = manager;
    this.configEngine = config;
    this.#steps = steps;
    this.#platform = platform;
    this.#kernel = new StateKernel(
      {
        forEachOwner: (_transaction, visit) => manager.forEach(visit),
        read: (plugin) => plugin.getState(),
        clone: (state) => state,
        apply: (plugin, state, transaction) =>
          plugin.apply(plugin instanceof DocInputPlugin ? state : this.#cloneStagedState(state), transaction),
        prepare: (plugin, state) => {
          if (plugin instanceof DocInputPlugin) return adoptCommittedDocInputState(state as DocInputState);
          plugin.lockCommittedState?.(state);
          return adoptCommittedPluginState(state);
        },
        publish: (states) =>
          states.forEach((state, plugin) => Plugin.prototype.setState.call(plugin, state, this.#stateCommitToken)),
      },
      (error) => this.#warn('Doc commit listener failed.', error),
    );
    this.#kernel.subscribe((commit) => {
      this.#commitSnapshot = Object.freeze({
        revision: commit.revision,
        changedOwners: Object.freeze([...commit.changes.keys()].map((plugin) => plugin.key.key)),
      });
    });
    for (const kind of Object.values(PipelineStepKind)) {
      if (steps.get(kind)) continue;
      steps.register({
        kind,
        execute(context, step) {
          switch (kind) {
            case PipelineStepKind.Transaction:
              context.executeTransaction(step);
              break;
            case PipelineStepKind.Invalidate:
              context.invalidateProjection(step);
              break;
            case PipelineStepKind.Interaction:
              context.applyInteraction(step);
              break;
            case PipelineStepKind.LocalAction:
              context.runLocalAction(step);
              break;
            case PipelineStepKind.PreparedAction:
              context.prepareLocalAction?.(step);
              break;
            case PipelineStepKind.PostCommit:
              context.schedulePostCommit(step);
              break;
          }
        },
      });
    }
  }

  /** Installs the editor's command authority before mutable services become observable. */
  public enforceCommandBoundary(
    isExecuting: () => boolean,
    runWithoutMutationAuthority: <Value>(callback: () => Value) => Value = runOutsideCommandExecution,
  ): void {
    if (this.#commandBoundaryCheck) throw new SearContractViolationError('Doc command boundary is already installed.');
    this.#commandBoundaryCheck = isExecuting;
    this.#runWithoutMutationAuthority = runWithoutMutationAuthority;
    if (this.#initialized) this.#sealPluginState();
  }

  /** Reserves kernel teardown for its owning runtime. */
  public enforceTeardownBoundary(token: object): void {
    if (this.#teardownToken) throw new SearContractViolationError('Doc kernel teardown boundary is already installed.');
    this.#teardownToken = token;
  }

  /** Initializes and protects the document's registered state owners. */
  public initialize(): void {
    if (this.#initialized || this.#destroyed) return;
    this.#initialized = true;
    this.#handlePlugin(this.pluginManager.getAllPlugins());
    if (this.#commandBoundaryCheck) this.#sealPluginState();
  }

  /** Registers one business state owner without constructing a presentation service. */
  public registerPlugin<T>(plugin: Plugin<T>): () => void {
    if (this.#destroyed) throw new SearContractViolationError('Doc kernel is destroyed.');
    if (this.#initialized && this.#commandBoundaryCheck && !this.#commandBoundaryCheck())
      throw new SearContractViolationError('Document plugin registration must run through editor.commands.run(...).');
    this.pluginManager.registerPlugin(plugin, this.#stateCommitToken);
    if (this.#initialized) {
      this.#handlePlugin([plugin]);
      if (this.#commandBoundaryCheck) this.#protectPluginState(plugin);
    }
    return () => this.unregisterPlugin(plugin.key);
  }

  /** Removes one state owner through its editor-owned registry boundary. */
  public unregisterPlugin(key: PluginKey): void {
    if (this.#initialized && !this.#destroyed && this.#commandBoundaryCheck && !this.#commandBoundaryCheck())
      throw new SearContractViolationError('Document plugin removal must run through editor.commands.run(...).');
    this.pluginManager.unregisterPlugin(key, this.#stateCommitToken);
  }

  /** Reads one committed state owner. */
  public getOwnerState<State>(key: PluginKey): State | undefined {
    return this.pluginManager.getPluginState<State>(key);
  }

  /** Reads the latest detached commit metadata. */
  public getCommitSnapshot(): DocCommitSnapshot {
    return this.#commitSnapshot;
  }

  /** Observes commit metadata without inheriting command mutation authority. */
  public subscribeCommits(listener: (snapshot: DocCommitSnapshot) => void): () => void {
    return this.#kernel.subscribe(() => this.#runWithoutMutationAuthority(() => listener(this.#commitSnapshot)));
  }

  /** Attaches an independent, assembly-owned state publication consumer. */
  public subscribePublications(listener: (publication: DocKernelPublication) => void): () => void {
    return this.#kernel.subscribe(listener);
  }

  /** Stages every transaction and prepares every owner before publishing the batch. */
  public executePipeline(pipeline: Pipeline): void {
    if (this.#destroyed) throw new SearContractViolationError('Doc kernel is destroyed.');
    const assertWrite = () => {
      if (this.#commandBoundaryCheck && !this.#commandBoundaryCheck())
        throw new SearContractViolationError('Document state changes must run through editor.commands.run(...).', {
          pipeline: pipeline.name,
        });
    };
    const changesState = (step: PipelineStep) =>
      step.kind !== PipelineStepKind.Invalidate ||
      !!(step.transaction || step.interaction || step.localAction || step.prepare || step.postCommit);
    if (pipeline.steps.some(changesState)) assertWrite();
    warnIfOutsideCommandExecution('DocKernel.executePipeline', this.#warn);
    pipeline.emitStart();
    const batch = this.#kernel.begin(),
      transactions: Transaction[] = [],
      projections = new Set<PluginKey>(),
      postCommit: Array<() => void> = [],
      rollback: Array<() => void> = [];
    const context: PipelineStepExecutionContext = {
      executeTransaction: (step) => {
        if (step.transaction) {
          assertWrite();
          batch.stage(step.transaction);
          transactions.push(step.transaction);
        }
      },
      invalidateProjection: (step) => {
        if (step.projectionKey) projections.add(step.projectionKey);
      },
      applyInteraction: () => {},
      runLocalAction: (step) => {
        if (step.localAction) {
          assertWrite();
          step.localAction();
        }
      },
      prepareLocalAction: (step) => {
        if (step.prepare) {
          assertWrite();
          rollback.push(step.prepare());
        }
      },
      schedulePostCommit: (step) => {
        if (step.postCommit) {
          assertWrite();
          postCommit.push(step.postCommit);
        }
      },
    };
    let publication: DocKernelPublication | undefined;
    try {
      for (const step of pipeline.steps) {
        pipeline.emitStepStart(step);
        if (changesState(step)) assertWrite();
        const executor = this.#steps.get(step.kind);
        if (!executor) throw new SearPipelineStepExecutorNotFoundError(step.kind);
        executor.execute(context, step);
        pipeline.emitStepComplete(step);
      }
      if (transactions.length || projections.size)
        publication = this.#kernel.commit(
          batch,
          Object.freeze({
            projections: Object.freeze([...projections]),
            transactions: Object.freeze([...transactions]),
          }),
        );
    } catch (error) {
      for (const undo of rollback.reverse()) {
        try {
          undo();
        } catch (cleanupError) {
          this.#warn('Doc pipeline preparation rollback failed.', cleanupError);
        }
      }
      throw error;
    }
    try {
      for (const commit of postCommit) {
        assertWrite();
        try {
          commit();
        } catch (error) {
          this.#warn('Doc post-commit action failed.', error);
        }
      }
      for (const transaction of transactions)
        this.pluginManager.forEach((plugin) => {
          try {
            plugin.onTransactionCommitted?.(transaction);
          } catch (error) {
            this.#warn('Doc transaction listener failed.', error);
          }
        });
    } finally {
      if (publication) this.#kernel.notify(publication);
    }
    pipeline.emitComplete();
  }

  /** Releases subscribers and state owners without invoking a view lifecycle. */
  public destroy(token?: object): void {
    if (this.#destroyed) return;
    if (this.#teardownToken && token !== this.#teardownToken)
      throw new SearContractViolationError('Doc kernel destruction requires its editor owner.');
    this.#destroyed = true;
    this.#kernel.destroy();
    for (const plugin of this.pluginManager.getAllPlugins()) this.unregisterPlugin(plugin.key);
  }

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

    if (Array.isArray(value)) {
      const clonedArray: unknown[] = [];
      for (const item of value) clonedArray.push(this.#cloneStagedState(item));
      return clonedArray as T;
    }

    if (value instanceof Map) {
      const cloned = new Map<unknown, unknown>();
      for (const [mapKey, mapValue] of value)
        cloned.set(this.#cloneStagedState(mapKey), this.#cloneStagedState(mapValue));
      return cloned as T;
    }

    if (value instanceof Set) {
      const cloned = new Set<unknown>();
      for (const setValue of value) cloned.add(this.#cloneStagedState(setValue));
      return cloned as T;
    }

    const prototype = Object.getPrototypeOf(value) as object | null;
    const clonedObject = Object.create(prototype) as Record<PropertyKey, unknown>;
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor) continue;
      if ('value' in descriptor) {
        descriptor.value = this.#cloneStagedState(descriptor.value);
        descriptor.writable = true;
        descriptor.configurable = true;
      }
      Object.defineProperty(clonedObject, key, descriptor);
    }
    return clonedObject as T;
  }

  #handlePlugin(plugins: Plugin<any>[]): void {
    for (const plugin of plugins) {
      for (const unit of plugin.registerConfig?.() ?? []) this.configEngine?.registerConfig(unit.key, unit.config);
    }

    plugins.forEach(function initializeDocPluginState(plugin) {
      const stateResult = plugin.registerState();
      if (!stateResult) return;
      const states = Array.isArray(stateResult) ? stateResult : [stateResult];
      states.forEach(function setDocPluginInitialState(stateRegistration) {
        if (stateRegistration.key === plugin.key) plugin.setState(stateRegistration.state);
      });
    });
  }

  #sealPluginState(): void {
    this.pluginManager.getAllPlugins().forEach((plugin) => this.#protectPluginState(plugin));
    PluginManager.prototype.enforceWriteBoundary.call(this.pluginManager, this.#stateCommitToken);
  }

  #protectPluginState(plugin: Plugin<unknown>): void {
    if (!this.#commandBoundaryCheck) return;
    if (Plugin.prototype.hasStateWriteBoundary.call(plugin)) {
      throw new SearContractViolationError('Doc plugin state is already owned by another editor.');
    }
    if (plugin.getState !== Plugin.prototype.getState || plugin.setState !== Plugin.prototype.setState) {
      throw new SearContractViolationError('Doc plugins must use guarded Plugin state accessors.');
    }
    if (plugin instanceof DocInputPlugin) {
      DocInputPlugin.prototype.enforceSessionWriteBoundary.call(
        plugin,
        this.#commandBoundaryCheck,
        this.#stateCommitToken,
        this.#runWithoutMutationAuthority,
      );
    } else {
      const initialState = plugin.getState();
      plugin.lockCommittedState?.(initialState);
      Plugin.prototype.setState.call(plugin, adoptCommittedPluginState(initialState));
      Plugin.prototype.enforceStateWriteBoundary.call(plugin, this.#stateCommitToken);
    }
    Plugin.prototype.sealRuntimeMetadata.call(plugin);
    const key = plugin.key;
    Object.defineProperties(plugin, {
      pluginKey: { value: key, writable: false, configurable: false },
      key: { get: () => key, configurable: false },
      getState: { value: Plugin.prototype.getState, writable: false, configurable: false },
      setState: { value: Plugin.prototype.setState, writable: false, configurable: false },
    });
  }
  #warn = (message: string, ...details: unknown[]): void => {
    try {
      this.#platform?.warn(message, ...details);
    } catch {
      /* Diagnostics cannot invalidate committed state. */
    }
  };
}
