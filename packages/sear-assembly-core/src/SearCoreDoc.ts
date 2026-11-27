import { ViewExtensionRegistry, type ViewExtension } from '@searsuite/sear-render-event-engine';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { Plugin, PluginKey, PluginManager } from '@searsuite/sear-assembly-plugin';
import { Transaction } from '@searsuite/sear-domain-transaction';
import { CSRMatrix } from '@searsuite/sear-domain-matrix';
import { BlockManager, NodeProperties, SceneGraph } from '@searsuite/sear-render-node';
import { RichDocNode, DocNodeRegistry, DocSelection, type DocCursorPos } from '@searsuite/sear-domain-doc';
import { EventEngine, getViewHandlerName, type EventWithOffsetAndTarget } from '@searsuite/sear-render-event-engine';
import { PositionRectProps, Rect } from '@searsuite/sear-foundation-rect';
import { SearError } from '@searsuite/sear-foundation-error';

import { DocCursorManager } from './DocCursorManager';
import { DocCompositionManager, type DocCompositionLayout, type DocCompositionProvider } from './DocCompositionManager';

import { DocRenderEngine } from '@searsuite/sear-render-engine';
import { DocLayoutEngine, type DocBlockLayout, type DocBlockLayoutDiff, type DocBlockRenderDebugSnapshot, type DocLayoutCache, type DocVerticalAlign, type LayoutSnapshot, lockLayoutSnapshot } from '@searsuite/sear-domain-editor';
import type { Schema } from '@searsuite/sear-domain-doc-schema';
import { DocInputPlugin, type DocInputState } from '@searsuite/sear-assembly-doc';
import { adoptCommittedDocInputState } from '@searsuite/sear-assembly-doc';
import { adoptCommittedPluginState } from '@searsuite/sear-assembly-sheet-state';
import { lockDocRenderLayoutState } from './lockDocRenderLayoutState';
import { collectDocRenderOperations, type DocRenderOperations } from './DocRenderDirtyBlocks';
import { Pipeline, PipelineStepKind, type PipelineStep } from '@searsuite/sear-assembly-plugin';
import { PipelineStepExecutorRegistry, type PipelineStepExecutionContext, type PipelineStepExecutor } from '@searsuite/sear-assembly-plugin';
import { warnIfOutsideCommandExecution } from '@searsuite/sear-assembly-plugin';
import { SearContractViolationError, SearPipelineStepExecutorNotFoundError } from '@searsuite/sear-assembly-plugin';
import { ConfigEngine } from '@searsuite/sear-assembly-config';
import { Platform } from '@searsuite/sear-foundation-platform';

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

interface DocStagedPluginState {
  readonly plugin: Plugin<unknown>;
  readonly state: unknown;
}

interface ResolvedDocEditorLayoutInput {
  readonly input: DocEditorRenderLayoutInput;
  readonly padding: number;
  readonly compositionProvider: DocCompositionProvider;
}

interface MutableDocEditorLayoutFrame {
  editorWidth: number;
  editorHeight: number;
  snapshot: LayoutSnapshot;
  cursorRelative: { x: number; y: number; height: number };
}

/** Input used by SearCoreDoc to initialize one editable document frame. */
export interface DocEditorRenderLayoutInput {
  /** Rich-document content to lay out and render. */
  readonly document: RichDocNode[];
  /** Current document selection. */
  readonly selection: DocSelection;
  /** Editor origin in world coordinates. */
  readonly origin: Pick<PositionRectProps, 'x' | 'y'>;
  /** Minimum editor width supplied by the host surface. */
  readonly minWidth: number;
  /** Minimum editor height supplied by the host surface. */
  readonly minHeight: number;
  /** Padding inside the editable frame. */
  readonly padding?: number;
  /** Font descriptor used by the text shaper for this layout. */
  readonly font?: string;
  /** Whether the transient text cursor should be visible in this frame. */
  readonly cursorVisible?: boolean;
  /** Optional minimum width needed to preserve pre-edit overflow sizing. */
  readonly minContentWidth?: number;
  /** Whether the editable frame may grow horizontally to fit unwrapped content. */
  readonly fitContentWidth?: boolean;
  /** Vertical positioning inside the editable frame. Defaults to center for embedded cell editors. */
  readonly verticalAlign?: DocVerticalAlign;
  /** Optional IME composition provider installed by a feature plugin or embedded host. */
  readonly compositionProvider?: DocCompositionProvider;
}

/** Doc-owned layout result consumed by host render surfaces. */
export interface DocPreparedEditorRenderLayout {
  /** Final editor frame in world coordinates. */
  readonly positionRect: PositionRectProps;
  /** Layout snapshot owned by the Doc input/render session. */
  readonly snapshot: LayoutSnapshot;
  /** Cursor point relative to the editor frame. */
  readonly cursorRelative: { x: number; y: number; height: number };
  /** Pixel offset from composing-text start to the IME caret. */
  readonly composingCaretPixelOffset: number;
  /** Width available to document content after padding. */
  readonly contentWidth: number;
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

/** Stages and commits rich-document transactions for one editor runtime. */
@Injectable()
export class SearCoreDoc {
  readonly #docCursorManager: DocCursorManager;
  readonly #docCompositionManager: DocCompositionManager;
  readonly #docLayoutEngine: DocLayoutEngine;
  readonly #stepExecutorRegistry: PipelineStepExecutorRegistry;

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
  #document: RichDocNode[] = [];
  readonly #defaultPadding = 0;
  #docRenderRequestHandler: DocRenderRequestHandler | null = null;
  #renderRequestCollector: DocRenderRequest[] | null = null;
  readonly #docRenderRequests: DocRenderRequest[] = [];
  #lastLayoutSnapshot: LayoutSnapshot | null = null;
  #docRenderLayoutState: DocRenderLayoutState | null = null;
  readonly #pluginEventDisposers = new Map<string, Array<() => void>>();
  #initialized = false;
  #started = false;
  #destroyed = false;
  #commandBoundaryCheck: (() => boolean) | undefined;
  #teardownToken: object | undefined;
  #runWithoutMutationAuthority: (<Value>(callback: () => Value) => Value) | undefined;
  readonly #stateCommitToken = {};

  /** Permanently require command dispatch for state-changing pipelines in an assembled editor. */
  public enforceCommandBoundary(
    isCommandExecuting: () => boolean,
    runWithoutMutationAuthority?: <Value>(callback: () => Value) => Value,
  ): void {
    if (this.#commandBoundaryCheck)
      throw new SearContractViolationError('Document command boundary is already installed.');
    this.#commandBoundaryCheck = isCommandExecuting;
    this.#runWithoutMutationAuthority = runWithoutMutationAuthority;
    for (const key of [
      'blockManager',
      'docCursorManager',
      'docCompositionManager',
      'docLayoutEngine',
      'stepExecutorRegistry',
      'renderStage',
      'renderEngine',
      'eventEngine',
      'configEngine',
      'platform',
    ])
      Object.defineProperty(this, key, { writable: false, configurable: false });
    if (this.#initialized) this.#sealPluginState();
  }

  /** Reserves assembled Doc Core cleanup for its editor facade. */
  public enforceTeardownBoundary(ownerToken: object): void {
    if (this.#teardownToken) throw new SearContractViolationError('Doc teardown boundary is already installed.');
    this.#teardownToken = ownerToken;
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
    @Inject(SearCoreDoc.pluginManagerSymbol)
    pluginManager: PluginManager,
    @Inject(PipelineStepExecutorRegistry.symbol)
    stepExecutorRegistry: PipelineStepExecutorRegistry,
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
    this.#docCursorManager = docCursorManager;
    this.#docCompositionManager = docCompositionManager;
    this.#docLayoutEngine = docLayoutEngine;
    this.#stepExecutorRegistry = stepExecutorRegistry;
    const layers = runtimeLayers;
    Object.defineProperty(this, 'pluginManager', { value: pluginManager, writable: false, configurable: false });
    this.renderStage = layers.renderStage ?? null;
    this.renderEngine = layers.renderEngine ?? null;
    this.eventEngine = layers.eventEngine ?? null;
    this.configEngine = layers.configEngine ?? null;
    this.#platform = layers.platform ?? null;
    this.#registerBuiltInPipelineStepExecutors();
  }

  #generateDocNodeFromString(content: string): RichDocNode[] {
    return [
      DocNodeRegistry.create({
        type: DocNodeRegistry.requireDefaultBlockType(),
        content: [DocNodeRegistry.create({ type: DocNodeRegistry.requireDefaultTextType(), text: content })],
      }),
    ];
  }

  #prepareLayoutDocument(state: RichDocNode[] | string, blockManager: BlockManager): void {
    blockManager.clear();
    const richContent = typeof state === 'string' ? this.#generateDocNodeFromString(state) : state;
    for (const node of richContent) {
      const documentNode = DocNodeRegistry.create(node);
      blockManager.add(documentNode);
    }
  }

  /** Loads one shared rich-document schema snapshot into this Core runtime. */
  public loadSnapshot(snapshot: readonly Schema[]): RichDocNode[] {
    if (this.#commandBoundaryCheck) {
      throw new SearContractViolationError(
        'Assembled Doc content must change through a RichDocOT command transaction.',
      );
    }
    const runtimeDocument = this.materializeSnapshot(snapshot);
    this.blockManager.clear();
    this.#document = runtimeDocument;
    return runtimeDocument;
  }

  /** Converts a shared snapshot into detached runtime nodes without changing Core state. */
  public materializeSnapshot(snapshot: readonly Schema[]): RichDocNode[] {
    return cloneRichDocumentSnapshot(snapshot).map((node) => DocNodeRegistry.create(node));
  }

  /** Exports a runtime document as the shared rich-document schema snapshot. */
  public exportSnapshot(document: readonly RichDocNode[] = this.#document): Schema[] {
    return cloneRichDocumentSnapshot(document as readonly Schema[]);
  }

  /** Returns the latest document layout snapshot prepared by Core. */
  public getLayoutSnapshot(): LayoutSnapshot | null {
    return this.#lastLayoutSnapshot;
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

  /**
   * Prepares the current editable document frame through the Doc-owned layout
   * path used by standalone document hosts and embedded editors.
   */
  public prepareEditorRenderLayout(input: DocEditorRenderLayoutInput): DocPreparedEditorRenderLayout {
    const mayCommit = !this.#commandBoundaryCheck || this.#commandBoundaryCheck();
    const blockManager = mayCommit ? this.blockManager : this.blockManager.createDetached();
    const resolved = this.#resolveEditorRenderLayoutInput(input);
    blockManager.setBaseFont?.(input.font ?? '16px sans-serif');
    this.#prepareLayoutDocument(resolved.input.document, blockManager);
    const frame = this.#prepareEditorLayoutFrame(resolved, blockManager);
    const composition = resolved.compositionProvider.measure(resolved.input.font ?? '16px sans-serif');
    this.#expandEditorFrameForComposition(resolved, frame, composition, blockManager);
    const prepared = this.#createPreparedEditorRenderLayout(resolved, frame, composition);
    if (mayCommit) {
      this.#commitPreparedEditorRenderLayout(resolved, prepared);
    }
    return prepared;
  }

  #resolveEditorRenderLayoutInput(input: DocEditorRenderLayoutInput): ResolvedDocEditorLayoutInput {
    return {
      input,
      padding: input.padding ?? this.#defaultPadding,
      compositionProvider: input.compositionProvider ?? this.#docCompositionManager,
    };
  }

  #prepareEditorLayoutFrame(
    resolved: ResolvedDocEditorLayoutInput,
    blockManager: BlockManager,
  ): MutableDocEditorLayoutFrame {
    const { input, padding } = resolved;
    const naturalWidth = input.fitContentWidth === false ? 0 : blockManager.maxWidth + padding * 2;
    const editorWidth = Math.max(input.minWidth, naturalWidth, input.minContentWidth ?? 0);
    const editorHeight = this.#resolveEditorHeight(editorWidth, input.minHeight, padding, blockManager);
    const snapshot = this.#buildEditorSnapshot(resolved, editorWidth, editorHeight, blockManager);
    return {
      editorWidth,
      editorHeight,
      snapshot,
      cursorRelative: this.#docLayoutEngine.cursorToPoint(input.selection.head, snapshot),
    };
  }

  #buildEditorSnapshot(
    resolved: ResolvedDocEditorLayoutInput,
    editorWidth: number,
    editorHeight: number,
    blockManager: BlockManager,
  ): LayoutSnapshot {
    const { input, padding } = resolved;
    return this.#docLayoutEngine.buildSnapshot(
      input.document,
      blockManager,
      editorWidth,
      editorHeight,
      padding,
      input.verticalAlign,
    );
  }

  #expandEditorFrameForComposition(
    resolved: ResolvedDocEditorLayoutInput,
    frame: MutableDocEditorLayoutFrame,
    composition: DocCompositionLayout,
    blockManager: BlockManager,
  ): void {
    if (!composition.active) return;
    const neededWidth = frame.cursorRelative.x + composition.textWidth + resolved.padding;
    if (neededWidth <= frame.editorWidth) return;
    frame.editorWidth = neededWidth;
    frame.editorHeight = this.#resolveEditorHeight(
      frame.editorWidth,
      resolved.input.minHeight,
      resolved.padding,
      blockManager,
    );
    frame.snapshot = this.#buildEditorSnapshot(resolved, frame.editorWidth, frame.editorHeight, blockManager);
    frame.cursorRelative = this.#docLayoutEngine.cursorToPoint(resolved.input.selection.head, frame.snapshot);
  }

  #createPreparedEditorRenderLayout(
    resolved: ResolvedDocEditorLayoutInput,
    frame: MutableDocEditorLayoutFrame,
    composition: DocCompositionLayout,
  ): DocPreparedEditorRenderLayout {
    return {
      positionRect: {
        x: resolved.input.origin.x,
        y: resolved.input.origin.y,
        width: frame.editorWidth,
        height: frame.editorHeight,
      },
      snapshot: frame.snapshot,
      cursorRelative: frame.cursorRelative,
      composingCaretPixelOffset: composition.caretPixelOffset,
      contentWidth: Math.max(0, frame.editorWidth - resolved.padding * 2),
    };
  }

  #commitPreparedEditorRenderLayout(
    resolved: ResolvedDocEditorLayoutInput,
    prepared: DocPreparedEditorRenderLayout,
  ): void {
    this.#lastLayoutSnapshot = lockLayoutSnapshot(prepared.snapshot);
    this.#setInputLastSnapshot(prepared.snapshot);
    this.#docCursorManager.setCursor({
      x: prepared.positionRect.x + prepared.cursorRelative.x,
      y: prepared.positionRect.y + prepared.cursorRelative.y,
      height: prepared.cursorRelative.height,
      visible: resolved.input.cursorVisible ?? true,
    });
    this.#docCursorManager.setSelectionRects(
      this.#docLayoutEngine.getSelectionRects(
        resolved.input.selection,
        prepared.snapshot,
        prepared.positionRect.x,
        prepared.positionRect.y,
      ),
    );
  }

  /**
   * Resolves a point inside the editable document frame to the closest
   * document cursor position.
   */
  public resolveCursorFromPoint(x: number, y: number, snapshot: LayoutSnapshot): DocCursorPos {
    return this.#docLayoutEngine.pointToCursor(x, y, snapshot);
  }

  #resolveEditorHeight(editorWidth: number, minHeight: number, padding: number, blockManager: BlockManager): number {
    const contentWidth = Math.max(0, editorWidth - padding * 2);
    const flatLines = blockManager.calculateLayoutPerParagraph(contentWidth).flat();
    let contentHeight = padding * 2;
    flatLines.forEach(function addDocEditorLineHeight(line) {
      contentHeight += line.lineBox?.lineHeight ?? line.height;
    });
    return Math.max(minHeight, contentHeight);
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

  /** Executes document command work through the shared observable Pipeline contract. */
  public executePipeline(pipeline: Pipeline): void {
    const core = this;
    function assertCommandBoundary(): void {
      if (core.#commandBoundaryCheck && !core.#commandBoundaryCheck()) {
        throw new SearContractViolationError('Document state changes must run through editor.commands.run(...).', {
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
    warnIfOutsideCommandExecution('SearCoreDoc.executePipeline', this.#warn);
    pipeline.emitStart();
    const stagedPluginStates = new Map<PluginKey, DocStagedPluginState>();
    const committedTransactions: Transaction[] = [];
    const postCommitActions: Array<() => void> = [];
    const renderRequests: DocRenderRequest[] = [];
    const previousCollector = this.#renderRequestCollector;
    this.#renderRequestCollector = renderRequests;
    function executeDocPipelineTransaction(step: PipelineStep): void {
      if (!step.transaction) return;
      assertCommandBoundary();
      core.#stageTransaction(step.transaction, stagedPluginStates);
      committedTransactions.push(step.transaction);
    }
    function executeDocPipelineRender(step: PipelineStep): void {
      if (!step.projectionKey) return;
      core.requestDocRender(step.projectionKey);
    }
    function executeDocPipelineInteraction(): void {}
    function executeDocPipelineLocalAction(step: PipelineStep): void {
      if (step.localAction) {
        assertCommandBoundary();
        step.localAction();
      }
    }
    function scheduleDocPipelinePostCommit(step: PipelineStep): void {
      if (step.postCommit) {
        assertCommandBoundary();
        postCommitActions.push(step.postCommit);
      }
    }
    const context: PipelineStepExecutionContext = {
      executeTransaction: executeDocPipelineTransaction,
      invalidateProjection: executeDocPipelineRender,
      applyInteraction: executeDocPipelineInteraction,
      runLocalAction: executeDocPipelineLocalAction,
      schedulePostCommit: scheduleDocPipelinePostCommit,
    };

    try {
      for (const step of pipeline.steps) {
        pipeline.emitStepStart(step);
        if (stepMayChangeState(step)) assertCommandBoundary();
        this.#executePipelineStep(context, step);
        pipeline.emitStepComplete(step);
      }
    } finally {
      this.#renderRequestCollector = previousCollector;
    }

    if (stagedPluginStates.size || postCommitActions.length) assertCommandBoundary();
    this.#commitStagedPluginStates(stagedPluginStates);
    postCommitActions.forEach((commit) => {
      assertCommandBoundary();
      commit();
    });

    if (committedTransactions.length > 0) renderRequests.push({});
    if (renderRequests.length > 0) {
      this.#dispatchDocRenderRequests(
        withDocRenderOperations(renderRequests, collectDocRenderOperations(committedTransactions)),
      );
    }

    pipeline.emitComplete();
    for (const transaction of committedTransactions) {
      this.pluginManager.forEach(function notifyDocPluginTransactionCommitted(plugin) {
        plugin.onTransactionCommitted?.(transaction);
      });
    }
  }

  #executePipelineStep(context: PipelineStepExecutionContext, step: PipelineStep): void {
    const executor = this.#stepExecutorRegistry.get(step.kind);
    if (!executor) throw new SearPipelineStepExecutorNotFoundError(step.kind);
    executor.execute(context, step);
  }

  #registerBuiltInPipelineStepExecutors(): void {
    this.#registerBuiltInPipelineStepExecutor({
      kind: PipelineStepKind.Transaction,
      execute: executeDocTransactionStep,
    });
    this.#registerBuiltInPipelineStepExecutor({
      kind: PipelineStepKind.Invalidate,
      execute: executeDocRenderStep,
    });
    this.#registerBuiltInPipelineStepExecutor({
      kind: PipelineStepKind.Interaction,
      execute: executeDocInteractionStep,
    });
    this.#registerBuiltInPipelineStepExecutor({
      kind: PipelineStepKind.LocalAction,
      execute: executeDocLocalActionStep,
    });
    this.#registerBuiltInPipelineStepExecutor({
      kind: PipelineStepKind.PostCommit,
      execute: executeDocPostCommitStep,
    });
  }

  #registerBuiltInPipelineStepExecutor(executor: PipelineStepExecutor): void {
    if (!this.#stepExecutorRegistry.get(executor.kind)) this.#stepExecutorRegistry.register(executor);
  }

  #stageTransaction(transaction: Transaction, stagedPluginStates: Map<PluginKey, DocStagedPluginState>): void {
    const core = this;
    this.pluginManager.forEach(function stageDocPluginTransaction(plugin) {
      const staged = stagedPluginStates.get(plugin.key);
      const previousState =
        staged?.state ??
        (plugin instanceof DocInputPlugin ? plugin.getState() : core.#cloneStagedState(plugin.getState()));
      const nextState = plugin.apply(previousState, transaction);
      if (nextState === null) return;
      stagedPluginStates.set(plugin.key, { plugin, state: nextState });
    });
  }

  #commitStagedPluginStates(stagedPluginStates: ReadonlyMap<PluginKey, DocStagedPluginState>): void {
    stagedPluginStates.forEach(({ plugin, state }) => {
      if (plugin instanceof DocInputPlugin) {
        Plugin.prototype.setState.call(
          plugin,
          adoptCommittedDocInputState(state as DocInputState),
          this.#stateCommitToken,
        );
      } else {
        if (this.#commandBoundaryCheck) {
          plugin.lockCommittedState?.(state);
          Plugin.prototype.setState.call(plugin, adoptCommittedPluginState(state), this.#stateCommitToken);
        } else {
          plugin.setState(state);
        }
      }
    });
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

  /** Requests a document render for plugin-owned render nodes. */
  public requestDocRender(pluginKey?: PluginKey): void {
    if (this.#commandBoundaryCheck && !this.#commandBoundaryCheck()) {
      throw new SearContractViolationError('Document render requests must run through editor.commands.run(...).');
    }
    warnIfOutsideCommandExecution('SearCoreDoc.requestDocRender', this.#warn);
    const request: DocRenderRequest = pluginKey ? { projectionKey: pluginKey } : {};
    if (this.#renderRequestCollector) {
      this.#renderRequestCollector.push(request);
      return;
    }
    this.#dispatchDocRenderRequests([request]);
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
    this.#handlePlugin(this.pluginManager.getAllPlugins());
    this.#viewExtensions.forEach((view) => {
      for (const unit of view.registerConfig?.() ?? []) this.configEngine?.registerConfig(unit.key, unit.config);
      view.initializeView?.(this);
    });
    this.#viewExtensions.forEach((view) => {
      this.renderStage?.addPluginNode(view.key.key, view.render?.(this) || []);
      this.#registerViewEvents(view);
    });
    if (this.#commandBoundaryCheck) this.#sealPluginState();
  }

  /** Starts standalone document runtime layers after initial plugin-node construction. */
  public start(): void {
    if (this.#started || this.#destroyed) return;
    if (!this.#initialized) this.initialize();
    this.#started = true;
    if (this.renderStage) this.renderEngine?.render(this.renderStage);
    if (this.renderStage) this.eventEngine?.render(this.renderStage);
  }

  /** Releases standalone document runtime ownership held by Core. */
  public destroy(ownerToken?: object): void {
    if (this.#destroyed) return;
    if (this.#teardownToken && ownerToken !== this.#teardownToken) {
      throw new SearContractViolationError('Doc Core cleanup requires its editor owner.');
    }
    this.#destroyed = true;
    this.#started = false;
    for (const plugin of this.pluginManager.getAllPlugins()) this.unregisterPlugin(plugin.key);
    this.#pluginEventDisposers.clear();
  }

  /** Registers the plugin. */
  public registerPlugin<T>(plugin: Plugin<T>): () => void {
    if (Plugin.prototype.hasStateWriteBoundary.call(plugin)) {
      throw new SearContractViolationError('Doc plugin state is already owned by another editor.');
    }
    if (this.#initialized && this.#commandBoundaryCheck && !this.#commandBoundaryCheck()) {
      throw new SearContractViolationError('Document plugin registration must run through editor.commands.run(...).');
    }
    this.pluginManager.registerPlugin(plugin, this.#stateCommitToken);
    if (this.#initialized && !this.#destroyed) this.#handlePlugin([plugin]);
    if (this.#initialized && this.#commandBoundaryCheck) this.#protectPluginState(plugin);
    const core = this;
    return function unregisterDocPlugin(): void {
      core.unregisterPlugin(plugin.key);
    };
  }

  /** Unregisters a plugin and removes core-owned runtime output for it. */
  public unregisterPlugin(pluginKey: PluginKey): void {
    if (this.#initialized && !this.#destroyed && this.#commandBoundaryCheck && !this.#commandBoundaryCheck()) {
      throw new SearContractViolationError('Document plugin removal must run through editor.commands.run(...).');
    }
    const plugin = this.getPluginInstance(pluginKey);
    if (!plugin) return;
    for (const dispose of this.#pluginEventDisposers.get(plugin.key.key) ?? []) dispose();
    this.#pluginEventDisposers.delete(plugin.key.key);
    this.renderStage?.markRemovePluginNode(plugin.key.key);
    this.pluginManager.unregisterPlugin(plugin.key, this.#stateCommitToken);
  }

  /** Returns the plugin. */
  public getPlugin<T = unknown>(pluginKey: PluginKey): T | undefined {
    return this.pluginManager.getPluginState<T>(pluginKey);
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

function executeDocTransactionStep(context: PipelineStepExecutionContext, step: PipelineStep): void {
  context.executeTransaction(step);
}

function executeDocRenderStep(context: PipelineStepExecutionContext, step: PipelineStep): void {
  context.invalidateProjection(step);
}

function executeDocInteractionStep(context: PipelineStepExecutionContext, step: PipelineStep): void {
  context.applyInteraction(step);
}

function executeDocLocalActionStep(context: PipelineStepExecutionContext, step: PipelineStep): void {
  context.runLocalAction(step);
}

function executeDocPostCommitStep(context: PipelineStepExecutionContext, step: PipelineStep): void {
  context.schedulePostCommit(step);
}

function withDocRenderOperations(
  requests: readonly DocRenderRequest[],
  renderOperations: DocRenderOperations,
): readonly DocRenderRequest[] {
  if (requests.length === 0) return requests;
  return requests.map((request) => ({ ...request, renderOperations }));
}

function cloneRichDocumentSnapshot(document: readonly Schema[]): Schema[] {
  return JSON.parse(JSON.stringify(document)) as Schema[];
}
