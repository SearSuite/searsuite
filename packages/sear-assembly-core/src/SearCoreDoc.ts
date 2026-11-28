import { DocKernel } from '@searsuite/sear-assembly-doc-kernel';
import { Plugin, PluginKey, PluginManager } from '@searsuite/sear-assembly-plugin';
import { DocNodeRegistry, RichDocNode, type DocCursorPos } from '@searsuite/sear-domain-doc';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { PositionRectProps } from '@searsuite/sear-foundation-rect';
import {
  EventEngine,
  getViewHandlerName,
  ViewExtensionRegistry,
  type EventWithOffsetAndTarget,
  type ViewExtension,
} from '@searsuite/sear-render-event-engine';
import { BlockManager, NodeProperties, SceneGraph } from '@searsuite/sear-render-node';
import {
  DocEditorLayout,
  type DocEditorRenderLayoutInput,
  type DocPreparedEditorRenderLayout,
} from './DocEditorLayout';

import { DocCompositionManager } from './DocCompositionManager';
import { DocCursorManager } from './DocCursorManager';

import { ConfigEngine } from '@searsuite/sear-assembly-config';
import { DocInputPlugin } from '@searsuite/sear-assembly-doc';
import { Pipeline, SearContractViolationError } from '@searsuite/sear-assembly-plugin';
import type { Schema } from '@searsuite/sear-domain-doc-schema';
import {
  DocLayoutEngine,
  type DocBlockLayout,
  type DocBlockLayoutDiff,
  type DocBlockRenderDebugSnapshot,
  type DocLayoutCache,
  type LayoutSnapshot,
} from '@searsuite/sear-domain-editor';
import { Platform } from '@searsuite/sear-foundation-platform';
import { DocRenderEngine } from '@searsuite/sear-render-engine';
import { collectDocRenderOperations, type DocRenderOperations } from './DocRenderDirtyBlocks';
import { lockDocRenderLayoutState } from './lockDocRenderLayoutState';

/** One queued render request targeting plugin-owned document render nodes. */
export interface DocRenderRequest {
  /** Plugin whose render nodes should be refreshed. Omitted means every document plugin may refresh. */
  readonly projectionKey?: PluginKey;
  /** Render-facing operations derived from committed RichDoc OT, or null when they cannot be converted safely. */
  readonly renderOperations?: DocRenderOperations;
}

/** Function that handles committed document render requests. */
export type DocRenderRequestHandler = (requests: readonly DocRenderRequest[]) => void;

/** Runtime layers owned by one SearCoreDoc instance. */
export interface SearCoreDocRuntimeLayers {
  readonly nodes?: DocNodeRegistry;
  /** Scene graph used by standalone document rendering. */
  readonly renderStage?: SceneGraph<NodeProperties> | null;
  /** Render engine used by standalone document hosts. */
  readonly renderEngine?: DocRenderEngine | null;
  /** Event pipeline and hit-testing facade used by standalone document hosts. */
  readonly eventEngine?: EventEngine<NodeProperties> | null;
  /** Configuration layer used by standalone document hosts. */
  readonly configEngine?: ConfigEngine | null;
  /** Platform diagnostics adapter used by document core guard clauses. */
  readonly platform?: Platform | null;
}

/** Layout and viewport state exposed to document plugins during render(). */
export interface DocRenderLayoutState {
  /** Visible viewport dimensions. */
  readonly viewport: { readonly width: number; readonly height: number };
  /** Editable content rectangle in viewport coordinates. */
  readonly contentRect: PositionRectProps;
  /** Latest full-document layout cache. */
  readonly layoutCache: DocLayoutCache;
  /** Block-level diff between the previous and current layout caches. */
  readonly blockLayoutDiff: DocBlockLayoutDiff;
  /** Laid-out blocks selected for the current viewport. */
  readonly visibleBlocks: readonly DocBlockLayout[];
  /** Current document layout rectangle in world coordinates. */
  readonly documentRect: PositionRectProps;
  /** Font selected by the host for this document render layout. */
  readonly font: string;
  /** Current viewport scroll offset. */
  readonly scroll: { readonly x: number; readonly y: number };
  /** Debug and performance stats for the most recent block-render frame. */
  readonly blockRender?: DocBlockRenderDebugSnapshot;
}

/** Subscribes document presentation to an independent business runtime. */
@Injectable()
export class SearCoreDoc {
  readonly #editorLayout: DocEditorLayout;
  readonly #kernel: DocKernel;
  readonly #unsubscribe: () => void;

  /** DI token for resolving SearCoreDoc. */
  public static readonly symbol: symbol = Symbol.for('SearCoreDoc');
  /** DI token for resolving the Doc-owned PluginManager without colliding with Sheet managers. */
  public static readonly pluginManagerSymbol: symbol = Symbol.for('SearCoreDoc.pluginManager');
  /** DI token for resolving the Doc runtime layers owned by this Core instance. */
  public static readonly runtimeLayersSymbol: symbol = Symbol.for('SearCoreDoc.runtimeLayers');

  /** Plugin manager for document runtime service plugins. */
  public readonly pluginManager!: PluginManager;
  readonly #viewExtensions: ViewExtensionRegistry<SearCoreDoc, NodeProperties>;
  /** Scene graph used by standalone document rendering when configured by assembly. */
  public renderStage: SceneGraph<NodeProperties> | null = null;
  /** Render engine used by standalone document hosts when configured by assembly. */
  public renderEngine: DocRenderEngine | null = null;
  /** Event pipeline and hit-testing facade used by standalone document hosts. */
  public eventEngine: EventEngine<NodeProperties> | null = null;
  /** Configuration layer used by standalone document hosts when configured by assembly. */
  public configEngine: ConfigEngine | null = null;
  #platform: Platform | null = null;

  /** Current state owned by SearCoreDoc. */
  #docRenderRequestHandler: DocRenderRequestHandler | null = null;
  readonly #docRenderRequests: DocRenderRequest[] = [];
  #docRenderLayoutState: DocRenderLayoutState | null = null;
  readonly #pluginEventDisposers = new Map<string, Array<() => void>>();
  #initialized = false;
  #started = false;
  #destroyed = false;
  #commandBoundaryCheck: (() => boolean) | undefined;
  #teardownToken: object | undefined;
  /** Installs the same command authority in the independent business kernel and its view. */
  public enforceCommandBoundary(
    isCommandExecuting: () => boolean,
    runWithoutMutationAuthority?: <Value>(callback: () => Value) => Value,
  ): void {
    this.#kernel.enforceCommandBoundary(isCommandExecuting, runWithoutMutationAuthority);
    this.enforceViewCommandBoundary(isCommandExecuting);
  }

  /** Protects local presentation services without taking ownership of business commands. */
  public enforceViewCommandBoundary(isCommandExecuting: () => boolean): void {
    this.#commandBoundaryCheck = isCommandExecuting;
    DocEditorLayout.prototype.enforceCommandBoundary.call(this.#editorLayout, isCommandExecuting);
    for (const key of [
      'blockManager',
      'docCursorManager',
      'docCompositionManager',
      'docLayoutEngine',
      'renderStage',
      'renderEngine',
      'eventEngine',
      'configEngine',
      'platform',
    ])
      Object.defineProperty(this, key, { writable: false, configurable: false });
  }

  /** Reserves presentation and kernel teardown for the owning editor. */
  public enforceTeardownBoundary(ownerToken: object): void {
    this.enforceViewTeardownBoundary(ownerToken);
    this.#kernel.enforceTeardownBoundary(ownerToken);
  }

  /** Reserves only the visual subscriber for its presentation owner. */
  public enforceViewTeardownBoundary(ownerToken: object): void {
    if (this.#teardownToken) throw new SearContractViolationError('Doc Core cleanup is already owned.');
    this.#teardownToken = ownerToken;
    this.#editorLayout.enforceTeardownBoundary(ownerToken);
  }

  /** Creates a SearCoreDoc instance. */
  constructor(
    @Inject(BlockManager.symbol) public blockManager: BlockManager,
    @Inject(DocCursorManager.symbol)
    docCursorManager: DocCursorManager,
    @Inject(DocCompositionManager.symbol)
    docCompositionManager: DocCompositionManager,
    @Inject(DocLayoutEngine.symbol)
    docLayoutEngine: DocLayoutEngine,
    @Inject(DocKernel.symbol) kernel: DocKernel,
    @Inject(SearCoreDoc.runtimeLayersSymbol)
    runtimeLayers: SearCoreDocRuntimeLayers,
    @Inject(ViewExtensionRegistry.symbol) views: ViewExtensionRegistry<SearCoreDoc, NodeProperties>,
  ) {
    this.#viewExtensions = views;
    this.#viewExtensions.subscribeRemovals((view) => {
      for (const dispose of this.#pluginEventDisposers.get(view.key.key) ?? []) dispose();
      this.#pluginEventDisposers.delete(view.key.key);
      this.renderStage?.markRemovePluginNode(view.key.key);
    });
    this.#editorLayout = new DocEditorLayout(
      blockManager,
      docCursorManager,
      docCompositionManager,
      docLayoutEngine,
      runtimeLayers.nodes ?? new DocNodeRegistry(),
      (snapshot) => this.#setInputLastSnapshot(snapshot),
    );
    this.#kernel = kernel;
    const layers = runtimeLayers;
    Object.defineProperty(this, 'pluginManager', { value: kernel.pluginManager, writable: false, configurable: false });
    this.renderStage = layers.renderStage ?? null;
    this.renderEngine = layers.renderEngine ?? null;
    this.eventEngine = layers.eventEngine ?? null;
    this.configEngine = layers.configEngine ?? null;
    this.#platform = layers.platform ?? null;
    this.#unsubscribe = kernel.subscribePublications((publication) => {
      const transactions = publication.effect?.transactions ?? [];
      const requests: DocRenderRequest[] = (publication.effect?.projections ?? []).map((key) => ({
        projectionKey: key,
      }));
      if (transactions.length) requests.push({});
      if (requests.length)
        this.#dispatchDocRenderRequests(withDocRenderOperations(requests, collectDocRenderOperations(transactions)));
    });
  }

  /** Materializes detached layout input without owning document state. */
  public materializeSnapshot(snapshot: readonly Schema[]): RichDocNode[] {
    return this.#editorLayout.materializeSnapshot(snapshot);
  }

  /** Reads the latest derived document layout. */
  public getLayoutSnapshot(): LayoutSnapshot | null {
    return this.#editorLayout.getLayoutSnapshot();
  }

  /** Sets the layout state consumed by DocPlugin.render(). */
  public setDocRenderLayoutState(state: DocRenderLayoutState | null): void {
    if (this.#commandBoundaryCheck && !this.#commandBoundaryCheck()) {
      throw new SearContractViolationError('Document render layout changes must run through editor.commands.run(...).');
    }
    this.#docRenderLayoutState = state ? lockDocRenderLayoutState(state) : null;
  }

  /** Returns the layout state consumed by DocPlugin.render(). */
  public getDocRenderLayoutState(): DocRenderLayoutState | null {
    return this.#docRenderLayoutState;
  }

  /** Prepares presentation geometry from the business owner's document snapshot. */
  public prepareEditorRenderLayout(input: DocEditorRenderLayoutInput): DocPreparedEditorRenderLayout {
    return this.#editorLayout.prepareEditorRenderLayout(input);
  }

  /** Resolves presentation geometry into a semantic document cursor. */
  public resolveCursorFromPoint(x: number, y: number, snapshot: LayoutSnapshot): DocCursorPos {
    return this.#editorLayout.resolveCursorFromPoint(x, y, snapshot);
  }

  #setInputLastSnapshot(snapshot: LayoutSnapshot): void {
    const plugin = this.getPluginInstance(DocInputPlugin.pluginKey);
    if (plugin instanceof DocInputPlugin) {
      plugin.setLastSnapshot(snapshot);
    }
  }

  /**
   * Binds the document render scheduler used by hosts that execute document commands.
   */
  public bindDocRenderRequestHandler(handler: DocRenderRequestHandler): void {
    this.#docRenderRequestHandler = handler;
  }
  /** Delegates document commands to the independently owned business kernel. */
  public executePipeline(pipeline: Pipeline): void {
    this.#kernel.executePipeline(pipeline);
  }

  /** Requests view-only work without owning a business state transaction. */
  public requestDocRender(pluginKey?: PluginKey): void {
    if (this.#commandBoundaryCheck && !this.#commandBoundaryCheck())
      throw new SearContractViolationError('Document render requests must run through editor.commands.run(...).');
    this.#dispatchDocRenderRequests([pluginKey ? { projectionKey: pluginKey } : {}]);
  }

  /** Returns a diagnostic snapshot of document render requests seen by this core. */
  public getDocRenderRequests(): readonly DocRenderRequest[] {
    return [...this.#docRenderRequests];
  }

  /** Clears diagnostic document render request history. */
  public clearDocRenderRequests(): void {
    this.#docRenderRequests.length = 0;
  }

  public initialize(): void {
    if (this.#initialized || this.#destroyed) return;
    this.#initialized = true;
    this.#kernel.initialize();
    this.#viewExtensions.forEach((view) => {
      for (const unit of view.registerConfig?.() ?? []) this.configEngine?.registerConfig(unit.key, unit.config);
      view.initializeView?.(this);
    });
    this.#viewExtensions.forEach((view) => {
      this.renderStage?.addPluginNode(view.key.key, view.render?.(this) || []);
      this.#registerViewEvents(view);
    });
  }

  /** Starts standalone document runtime layers after initial plugin-node construction. */
  public start(): void {
    if (this.#started || this.#destroyed) return;
    if (!this.#initialized) this.initialize();
    this.#started = true;
    if (this.renderStage) this.renderEngine?.render(this.renderStage);
    if (this.renderStage) this.eventEngine?.render(this.renderStage);
  }
  /** Detaches the view subscriber before releasing its owned business runtime. */
  public destroy(ownerToken?: object): void {
    this.destroyView(ownerToken);
    this.#kernel.destroy(ownerToken);
  }

  /** Detaches presentation while the independent document kernel remains alive. */
  public destroyView(ownerToken?: object): void {
    if (this.#destroyed) return;
    if (this.#teardownToken && ownerToken !== this.#teardownToken)
      throw new SearContractViolationError('Doc Core cleanup requires its editor owner.');
    this.#destroyed = true;
    this.#editorLayout.destroy(ownerToken);
    this.#started = false;
    this.#unsubscribe();
    for (const disposers of this.#pluginEventDisposers.values()) for (const dispose of disposers) dispose();
    this.#pluginEventDisposers.clear();
  }

  /** Registers a state owner in the document kernel. */
  public registerPlugin<T>(plugin: Plugin<T>): () => void {
    return this.#kernel.registerPlugin(plugin);
  }

  /** Removes a business state owner without changing independently registered views. */
  public unregisterPlugin(pluginKey: PluginKey): void {
    this.#kernel.unregisterPlugin(pluginKey);
  }

  /** Reads committed state from the document kernel. */
  public getPlugin<T = unknown>(pluginKey: PluginKey): T | undefined {
    return this.#kernel.getOwnerState<T>(pluginKey);
  }

  /** Returns independent document presentation contributions. */
  public getViewExtensions(): ViewExtensionRegistry<SearCoreDoc, NodeProperties> {
    return this.#viewExtensions;
  }

  /** Get a plugin instance by key (for calling plugin-specific methods). */
  public getPluginInstance(pluginKey: PluginKey): Plugin<any> | undefined {
    return this.pluginManager.getAllPlugins().find(function isRequestedDocPlugin(plugin) {
      return plugin.key.key === pluginKey.key;
    });
  }

  #registerViewEvents(plugin: ViewExtension<SearCoreDoc, NodeProperties>): void {
    const registeredEvents = this.eventEngine?.eventRegistrar.registeredEvents ?? [];
    const core = this;
    for (const eventName of registeredEvents) {
      const handlerName = getViewHandlerName(eventName);
      const candidate = Reflect.get(plugin, handlerName);
      if (typeof candidate !== 'function') continue;
      const handler = candidate as (
        core: SearCoreDoc,
        event: EventWithOffsetAndTarget<NodeProperties>,
      ) => boolean | void;
      const unregister = this.eventEngine?.registerEvent(
        eventName,
        function dispatchDocPluginEvent(event: EventWithOffsetAndTarget<NodeProperties>) {
          return handler.call(plugin, core, event);
        },
      );
      if (unregister) this.#addPluginEventDisposer(plugin.key.key, unregister);
    }
  }

  #addPluginEventDisposer(pluginKey: string, unregister: () => void): void {
    const disposers = this.#pluginEventDisposers.get(pluginKey);
    if (disposers) {
      disposers.push(unregister);
      return;
    }
    this.#pluginEventDisposers.set(pluginKey, [unregister]);
  }

  #dispatchDocRenderRequests(requests: readonly DocRenderRequest[]): void {
    this.#docRenderRequestHandler?.(requests);
    this.#docRenderRequests.push(...requests);
  }

  #readPendingDocument(): readonly RichDocNode[] {
    return this.getPlugin<{ readonly pendingDoc: readonly RichDocNode[] }>(DocInputPlugin.pluginKey)?.pendingDoc ?? [];
  }

  #warn = (message: string, ...details: unknown[]): void => {
    this.#platform?.warn?.(message, ...details);
  };
}

function withDocRenderOperations(
  requests: readonly DocRenderRequest[],
  renderOperations: DocRenderOperations,
): readonly DocRenderRequest[] {
  if (requests.length === 0) return requests;
  return requests.map((request) => ({ ...request, renderOperations }));
}
