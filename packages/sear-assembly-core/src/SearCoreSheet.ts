import { ConfigEngine } from '@searsuite/sear-assembly-config';
import { Pipeline, PluginKey, PluginManager, SearContractViolationError } from '@searsuite/sear-assembly-plugin';
import { SheetKernel, type SheetCommitSnapshot } from '@searsuite/sear-assembly-sheet-kernel';
import { type SheetDataEngine } from '@searsuite/sear-domain-sheet';
import { type Transaction } from '@searsuite/sear-domain-transaction';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';
import { RenderEngine, SheetRenderEngine } from '@searsuite/sear-render-engine';
import {
  EventEngine,
  getViewHandlerName,
  ViewExtensionRegistry,
  type EventWithOffsetAndTarget,
  type ViewExtension,
} from '@searsuite/sear-render-event-engine';
import { SceneGraph } from '@searsuite/sear-render-node';
import { type CellProperties } from '@searsuite/sear-render-registry';
import { ScrollManager } from '@searsuite/sear-render-scroll';
import { SheetLifecycleCoordinator } from './SheetLifecycleCoordinator';
import { SheetViewRuntime } from './SheetViewRuntime';

/** Owns the visual Sheet session attached to an independent transactional kernel. */
@Injectable()
export class SearCoreSheet {
  public static readonly symbol = Symbol.for('SearCoreSheet');
  public readonly dataEngine: SheetDataEngine;
  public readonly pluginManager: PluginManager;
  public readonly configEngine: ConfigEngine;
  public readonly renderEngine: SheetRenderEngine;
  public readonly eventEngine: EventEngine<CellProperties>;
  readonly #kernel: SheetKernel;
  readonly #stage: SceneGraph<CellProperties>;
  readonly #views: ViewExtensionRegistry<SearCoreSheet, CellProperties>;
  readonly #view: SheetViewRuntime;
  readonly #lifecycle: SheetLifecycleCoordinator;
  readonly #unsubscribe: () => void;
  #initialized = false;
  #started = false;
  #destroyed = false;
  #teardownToken: object | undefined;
  constructor(
    @Inject(SceneGraph.symbol) stage: SceneGraph<CellProperties>,
    @Inject(SheetKernel.symbol) kernel: SheetKernel,
    @Inject(RenderEngine.symbol) render: SheetRenderEngine,
    @Inject(EventEngine.symbol) events: EventEngine<CellProperties>,
    @Inject(SheetLifecycleCoordinator.symbol) lifecycle: SheetLifecycleCoordinator,
    @Inject(Platform.symbol) platform: Platform,
    @Inject(ViewExtensionRegistry.symbol) views: ViewExtensionRegistry<SearCoreSheet, CellProperties>,
  ) {
    this.#kernel = kernel;
    this.#stage = stage;
    this.#views = views;
    this.#lifecycle = lifecycle;
    this.dataEngine = kernel.dataEngine;
    this.pluginManager = kernel.pluginManager;
    this.configEngine = kernel.configEngine;
    this.renderEngine = render;
    this.eventEngine = events;
    for (const key of ['dataEngine', 'pluginManager', 'configEngine', 'renderEngine', 'eventEngine'])
      Object.defineProperty(this, key, { writable: false, configurable: false });
    this.#view = new SheetViewRuntime(this, views, platform);
    this.#unsubscribe = kernel.subscribePublications((commit) =>
      this.#view.onCommit(
        Object.freeze({
          revision: commit.revision,
          changedOwners: Object.freeze([...commit.changes.keys()].map((owner) => owner.key)),
          projections: commit.effect?.projections ?? Object.freeze([]),
          interactionChanged: commit.effect?.interactionChanged ?? false,
        }),
      ),
    );
  }
  /** Installs the command authority shared by the kernel and its attached presentation. */
  public enforceCommandBoundary(isExecuting: () => boolean): void {
    this.#kernel.enforceCommandBoundary(isExecuting);
  }
  /** Reserves presentation and state teardown for the owning editor. */
  public enforceTeardownBoundary(token: object): void {
    if (this.#teardownToken) throw new SearContractViolationError('Sheet teardown boundary is already installed.');
    this.enforceViewTeardownBoundary(token);
    this.#kernel.enforceTeardownBoundary(token);
  }
  /** Reserves view teardown without changing ownership of the attached business kernel. */
  public enforceViewTeardownBoundary(token: object): void {
    if (this.#teardownToken) throw new SearContractViolationError('Sheet teardown boundary is already installed.');
    this.#teardownToken = token;
    ScrollManager.prototype.enforceTeardownBoundary.call(this.renderEngine.scrollManager, token);
  }
  /** Reads the latest state publication metadata. */
  public getCommitSnapshot(): SheetCommitSnapshot {
    return this.#kernel.getCommitSnapshot();
  }
  /** Observes committed state without receiving scene references. */
  public subscribeCommits(listener: (snapshot: SheetCommitSnapshot) => void): () => void {
    return this.#kernel.subscribeCommits(listener);
  }
  /** Returns the renderer owned by this visual session. */
  public getRenderEngine() {
    return this.renderEngine;
  }
  /** Returns the Sheet data reader used by this view. */
  public getDataEngine() {
    return this.dataEngine;
  }
  /** Returns independently registered view extensions. */
  public getViewExtensions() {
    return this.#views;
  }
  /** Returns the retained scene graph. */
  public getStage() {
    return this.#stage;
  }
  /** Reads committed state owned by the supplied identity. */
  public getPlugin(key: PluginKey) {
    return this.#kernel.getOwnerState(key);
  }
  /** Initializes the shared state kernel before attaching views and native events. */
  public initialize(): void {
    if (this.#initialized || this.#destroyed) return;
    this.#initialized = true;
    this.#kernel.initialize();
    this.#views.forEach((view) => view.initializeView?.(this));
    this.#views.forEach((view) => {
      this.#view.initializeExtension(view);
    });
    this.#views.forEachInput((view) => this.#registerViewEvents(view));
    this.refreshContentBoundary();
  }
  /** Starts native adapters and presentation controllers. */
  public start(): void {
    if (this.#started || this.#destroyed) return;
    if (!this.#initialized) this.initialize();
    this.#started = true;
    this.#kernel.start();
    this.#view.start();
    this.#lifecycle.start({ core: this, refreshSheetBoundaries: () => this.refreshContentBoundary() });
  }
  /** Detaches visual subscriptions before editor-owned view resources are released. */
  public beginTeardown(token?: object): void {
    if (this.#teardownToken && token !== this.#teardownToken)
      throw new SearContractViolationError('Sheet presentation teardown requires its editor owner.');
    this.#unsubscribe();
    this.#view.destroy();
  }
  /** Releases the visual subscriber and the kernel owned by this editor. */
  public destroy(token?: object): void {
    if (this.#destroyed) return;
    if (this.#teardownToken && token !== this.#teardownToken)
      throw new SearContractViolationError('Sheet presentation destruction requires its editor owner.');
    this.destroyView(token);
    this.#kernel.destroy(token);
  }
  /** Releases native adapters and subscriptions while retaining the business runtime. */
  public destroyView(token?: object): void {
    if (this.#destroyed) return;
    if (this.#teardownToken && token !== this.#teardownToken)
      throw new SearContractViolationError('Sheet presentation destruction requires its editor owner.');
    this.#destroyed = true;
    this.beginTeardown(token);
    this.eventEngine.destroy(token);
    this.#lifecycle.destroy();
    this.renderEngine.scrollManager.destroy(token);
  }
  /** Requests a scene update without introducing a business plugin hook. */
  public requestRender(...views: Pick<ViewExtension<SearCoreSheet, CellProperties>, 'key'>[]): void {
    this.#view.requestRender(views);
  }
  /** Recomputes logical viewport limits from committed dimensions. */
  public refreshContentBoundary(): void {
    this.#view.refreshBoundaries();
  }
  /** Rebuilds viewport-culled scene output. */
  public refreshViewport(): void {
    this.#view.refreshViewport();
  }
  /** Dispatches a typed command's pipeline to the state kernel. */
  public executePipeline(pipeline: Pipeline): void {
    this.#kernel.executePipeline(pipeline);
  }
  /** Reads staged transaction results without publishing them. */
  public previewTransactionStates(transactions: readonly Transaction[]): ReadonlyMap<PluginKey, unknown> {
    return this.#kernel.previewTransactionStates(transactions);
  }

  #registerViewEvents(plugin: ViewExtension<SearCoreSheet, CellProperties>) {
    const {
      eventEngine: {
        eventRegistrar: { registeredEvents },
      },
    } = this;
    registeredEvents.forEach((eventName) => {
      const handlerName = getViewHandlerName(eventName);
      const candidate = Reflect.get(plugin, handlerName);
      if (typeof candidate === 'function') {
        const handler = candidate as (
          core: SearCoreSheet,
          event: EventWithOffsetAndTarget<CellProperties>,
        ) => boolean | void;
        const core = this;
        this.eventEngine.registerEvent(
          eventName,
          function forwardSheetViewEvent(event: EventWithOffsetAndTarget<CellProperties>): boolean | void {
            // Forward the plugin return value directly.
            // When a plugin returns `false`, EventListener.emit stops propagation to later plugins.
            return handler.call(plugin, core, event);
          },
        );
      }
    });
  }
}
