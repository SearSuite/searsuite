import {
  SearCoreDoc,
  type DocRenderLayoutState,
  type DocRenderOperation,
  type DocRenderRequest,
  type DocRenderOperations,
  warnIfOutsideCommandExecution,
} from '@searsuite/sear-assembly-core';
import { DocCommandBus } from '@searsuite/sear-assembly-commands';
import { ConfigEngine } from '@searsuite/sear-assembly-config';
import { type Plugin } from '@searsuite/sear-assembly-plugin';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';
import { SearError } from '@searsuite/sear-foundation-error';
import { type PositionRectProps } from '@searsuite/sear-foundation-rect';
import { RenderContext } from '@searsuite/sear-render-context';
import { DocRenderEngine } from '@searsuite/sear-render-engine';
import { TextInput } from '@searsuite/sear-render-input';
import { SceneGraph, type RichTextRenderNodeProperties } from '@searsuite/sear-render-node';
import { ScrollManager } from '@searsuite/sear-render-scroll';
import {
  BlockRasterCopyPlan,
  IncrementalRenderDecisionReason,
  IncrementalRenderPolicy,
  type BlockRasterCopyCandidate,
  type IncrementalRenderCandidate,
  type IncrementalRenderDecision,
} from '@searsuite/sear-render-strategy';

import { DocEditorLifecycleState } from './DocEditorLifecycleState';
import {
  type DocEditorRuntimeConfiguration,
  DocEditorRuntimeConfigurationSymbol,
} from './DocEditorRuntimeConfiguration';
import { type DocEditorContentRect, type DocEditorViewport } from './createDocEditor';
import { DocRenderLayoutService, type DocRenderLayout } from './DocRenderLayoutService';
import { type DocBlockRenderDebugSnapshot } from './DocVirtualLayoutStore';
import { DocViewportEnvironment } from './DocViewportEnvironment';
import { DocContentRenderPluginKey } from '@searsuite/sear-assembly-doc';
import { RenderDocViewportCommand } from './DocViewportCommands';
import { createDocFontDescriptor } from './createDocFontDescriptor';

/** Owns layout snapshots, text-input placement, and render pass execution. */
@Injectable()
export class DocRenderCoordinator {
  readonly #searCoreDoc: SearCoreDoc;
  readonly #renderEngine: DocRenderEngine;
  readonly #renderContext: RenderContext;
  readonly #sceneGraph: SceneGraph<RichTextRenderNodeProperties>;
  readonly #textInput: TextInput;
  readonly #scrollManager: ScrollManager;
  readonly #viewportEnvironment: DocViewportEnvironment;
  readonly #renderLayouts: DocRenderLayoutService;
  readonly #configuration: DocEditorRuntimeConfiguration;
  readonly #configEngine: ConfigEngine;
  readonly #lifecycle: DocEditorLifecycleState;
  readonly #platform: Platform;
  readonly #commands: DocCommandBus;
  readonly #incrementalRenderPolicy: IncrementalRenderPolicy;

  /** DI token for resolving the render coordinator. */
  public static readonly symbol = Symbol.for('DocRenderCoordinator');

  #stopScrollReRender: (() => void) | null = null;
  #scrollRenderFrame: number | null = null;
  #teardownToken: object | undefined;
  #destroyed = false;
  #bound = false;

  /** Reserves render subscription cleanup for the editor owner. */
  public enforceTeardownBoundary(ownerToken: object): void {
    if (this.#teardownToken) throw new SearError('Doc render teardown boundary is already installed.');
    this.#teardownToken = ownerToken;
  }

  /** Creates a render coordinator for one document editor instance. */
  public constructor(
    @Inject(SearCoreDoc.symbol)
    searCoreDoc: SearCoreDoc,
    @Inject(DocRenderEngine.symbol)
    renderEngine: DocRenderEngine,
    @Inject(RenderContext.symbol)
    renderContext: RenderContext,
    @Inject(SceneGraph.symbol)
    sceneGraph: SceneGraph<RichTextRenderNodeProperties>,
    @Inject(TextInput.symbol)
    textInput: TextInput,
    @Inject(ScrollManager.symbol)
    scrollManager: ScrollManager,
    @Inject(DocViewportEnvironment.symbol)
    viewportEnvironment: DocViewportEnvironment,
    @Inject(DocRenderLayoutService.symbol)
    renderLayouts: DocRenderLayoutService,
    @Inject(DocEditorRuntimeConfigurationSymbol)
    configuration: DocEditorRuntimeConfiguration,
    @Inject(ConfigEngine.symbol)
    configEngine: ConfigEngine,
    @Inject(DocEditorLifecycleState.symbol)
    lifecycle: DocEditorLifecycleState,
    @Inject(Platform.symbol)
    platform: Platform,
    @Inject(DocCommandBus.symbol)
    commands: DocCommandBus,
    @Inject(IncrementalRenderPolicy.symbol)
    incrementalRenderPolicy: IncrementalRenderPolicy,
  ) {
    this.#searCoreDoc = searCoreDoc;
    this.#renderEngine = renderEngine;
    this.#renderContext = renderContext;
    this.#sceneGraph = sceneGraph;
    this.#textInput = textInput;
    this.#scrollManager = scrollManager;
    this.#viewportEnvironment = viewportEnvironment;
    this.#renderLayouts = renderLayouts;
    this.#configuration = configuration;
    this.#configEngine = configEngine;
    this.#lifecycle = lifecycle;
    this.#platform = platform;
    this.#commands = commands;
    this.#incrementalRenderPolicy = incrementalRenderPolicy;
  }

  /** Binds Core render requests and scroll updates to document plugin-node refresh plus render(stage). */
  public bind(): void {
    if (this.#destroyed) throw new SearError('Doc render coordinator has been destroyed.');
    if (this.#bound) return;
    this.#bound = true;
    this.#updateViewport();
    this.#searCoreDoc.bindDocRenderRequestHandler(this.#renderDocumentRequests.bind(this));
    this.#stopScrollReRender = this.#scrollManager.subscribeScroll(this.#handleScrollReRender.bind(this), true);
  }

  /** Releases scroll-triggered subscriptions and pending animation work owned by this coordinator. */
  public destroy(ownerToken?: object): void {
    if (this.#destroyed) return;
    if (this.#teardownToken && ownerToken !== this.#teardownToken) {
      throw new SearError('Doc render cleanup requires its editor owner.');
    }
    this.#destroyed = true;
    this.#stopScrollReRender?.();
    this.#stopScrollReRender = null;
    if (this.#scrollRenderFrame !== null) this.#platform.cancelAnimationFrame(this.#scrollRenderFrame);
    this.#scrollRenderFrame = null;
  }

  /** Invalidates cached layout state owned by the render coordinator. */
  public resetLayoutCache(): void {
    if (!this.#commands.isExecuting()) throw new SearError('Doc layout changes must run through editor.commands.run(...).');
    this.#renderLayouts.reset();
  }

  /** Renders a command-owned viewport scroll frame. */
  public renderViewportScrollFrame(): boolean {
    if (!this.#commands.isExecuting()) throw new SearError('Doc rendering must run through editor.commands.run(...).');
    warnIfOutsideCommandExecution('DocRenderCoordinator.renderViewportScrollFrame');
    return this.#renderScrollFrame();
  }

  #renderDocumentRequests(requests: readonly DocRenderRequest[]): void {
    if (this.#renderInteractionRequests(requests)) return;
    this.#renderContentFrame(requests);
  }

  #renderContentFrame(requests: readonly DocRenderRequest[]): boolean {
    return this.#renderFrame({
      markSceneDirty: true,
      reuseLayout: false,
      renderOperations: collectRequestedRenderOperations(requests),
    });
  }

  #renderScrollFrame(): boolean {
    return this.#renderFrame({ markSceneDirty: false, reuseLayout: true, renderOperations: EMPTY_RENDER_OPERATIONS });
  }

  #renderInteractionRequests(requests: readonly DocRenderRequest[]): boolean {
    const requestedPluginKeys = this.#createInteractionPluginKeySet(requests);
    if (!requestedPluginKeys) return false;
    if (this.#lifecycle.isDestroyed()) return false;
    this.#updateViewport();
    this.#renderContext.setFont(createDocFontDescriptor(this.#configEngine.getDefaultConfig()));
    const currentContentRect = this.#viewportEnvironment.getContentRect();
    const currentViewport = this.#viewportEnvironment.getViewport();
    const layout = this.#renderLayouts.refreshInteractionLayout(currentContentRect, currentViewport);
    if (!layout) return false;
    this.#searCoreDoc.setDocRenderLayoutState(this.#createRenderLayoutState(layout, currentContentRect));
    this.#refreshRequestedPluginNodes(requestedPluginKeys, true);
    this.#updateTextInputPosition(layout.cursorX, layout.cursorY, layout.composingCaretPixelOffset);
    this.#renderEngine.render(this.#sceneGraph);
    this.#searCoreDoc.eventEngine?.renderHitOnNextFrame(this.#sceneGraph);
    return true;
  }

  #renderFrame(options: {
    readonly markSceneDirty: boolean;
    readonly reuseLayout: boolean;
    readonly renderOperations: DocRenderOperations;
  }): boolean {
    if (this.#lifecycle.isDestroyed()) return false;
    this.#updateViewport();
    this.#renderContext.setFont(createDocFontDescriptor(this.#configEngine.getDefaultConfig()));
    const currentContentRect = this.#viewportEnvironment.getContentRect();
    const currentViewport = this.#viewportEnvironment.getViewport();
    const prepareMode = options.reuseLayout ? 'viewport' : 'full';
    const prepareStart = this.#platform.now();
    const layout = options.reuseLayout
      ? this.#renderLayouts.prepareViewportLayout(currentContentRect, currentViewport)
      : this.#renderLayouts.prepareRenderLayout(currentContentRect, currentViewport, options.renderOperations);
    this.#renderLayouts.recordRenderPrepareTiming(prepareMode, this.#platform.now() - prepareStart);
    const blockRasterCopy = options.reuseLayout
      ? NO_INCREMENTAL_RENDER_PLAN
      : this.#resolveBlockRasterCopyPlan(layout, currentViewport);
    this.#renderEngine.setBlockRasterCopyPlan(blockRasterCopy.plan);
    const expectedFrameMode = options.reuseLayout ? 'scroll' : blockRasterCopy.plan ? 'block-copy' : 'full';
    this.#searCoreDoc.setDocRenderLayoutState(
      this.#createRenderLayoutState(
        layout,
        currentContentRect,
        createBlockRenderDebugSnapshot(
          layout,
          blockRasterCopy.plan,
          expectedFrameMode,
          blockRasterCopy.decision,
          blockRasterCopy.candidate,
        ),
      ),
    );
    this.#refreshAllPluginNodes(options.markSceneDirty, blockRasterCopy.plan !== null);

    this.#updateTextInputPosition(layout.cursorX, layout.cursorY, layout.composingCaretPixelOffset);
    this.#renderEngine.render(this.#sceneGraph);
    this.#renderLayouts.recordBlockRenderDebugSnapshot(
      createBlockRenderDebugSnapshot(
        layout,
        blockRasterCopy.plan,
        this.#renderEngine.getLastScreenRenderMode() ?? 'skipped',
        blockRasterCopy.decision,
        blockRasterCopy.candidate,
      ),
    );
    this.#searCoreDoc.eventEngine?.renderHitOnNextFrame(this.#sceneGraph);
    return true;
  }

  #refreshAllPluginNodes(markDirty: boolean, useBlockRasterCopy: boolean): void {
    const coordinator = this;
    function refreshDocPluginNodes(plugin: Plugin<SearCoreDoc, RichTextRenderNodeProperties, unknown>): void {
      coordinator.#refreshPluginNodes(plugin, markDirty, useBlockRasterCopy);
    }
    this.#searCoreDoc.pluginManager.forEach(refreshDocPluginNodes);
  }

  #refreshPluginNodes(
    plugin: Plugin<SearCoreDoc, RichTextRenderNodeProperties, unknown>,
    markDirty: boolean,
    useBlockRasterCopy: boolean = false,
  ): void {
    const shapes = plugin.render?.(this.#searCoreDoc) || [];
    if (plugin.key.key === DocContentRenderPluginKey.key && (!markDirty || useBlockRasterCopy)) {
      const layout = this.#searCoreDoc.getDocRenderLayoutState();
      const changedBlockKeys = useBlockRasterCopy
        ? new Set(layout?.blockLayoutDiff.getChangedEntries().map((entry) => entry.id) ?? [])
        : new Set<string>();
      const reconcileOptions = {
        markDirty: useBlockRasterCopy ? false : markDirty,
        retainExisting: true,
        updateRetainedGeometry: true,
        replaceRetainedGeometryChanged: true,
        ...(changedBlockKeys.size > 0 ? { replaceRetainedKeys: changedBlockKeys } : {}),
      };
      this.#sceneGraph.reconcilePluginNodes(plugin.key.key, shapes, reconcileOptions);
      return;
    }
    this.#sceneGraph.addPluginNode(plugin.key.key, shapes, { markDirty });
  }

  #refreshRequestedPluginNodes(requestedPluginKeys: ReadonlySet<string>, markDirty: boolean): void {
    const coordinator = this;
    function refreshRequestedDocPluginNodes(plugin: Plugin<SearCoreDoc, RichTextRenderNodeProperties, unknown>): void {
      if (requestedPluginKeys.has(plugin.key.key)) coordinator.#refreshPluginNodes(plugin, markDirty);
    }
    this.#searCoreDoc.pluginManager.forEach(refreshRequestedDocPluginNodes);
  }

  #createInteractionPluginKeySet(requests: readonly DocRenderRequest[]): ReadonlySet<string> | null {
    if (requests.length === 0) return null;
    const requestedPluginKeys = new Set<string>();
    for (const request of requests) {
      const pluginKey = request.renderPluginKey;
      if (!pluginKey || pluginKey.key === DocContentRenderPluginKey.key) return null;
      requestedPluginKeys.add(pluginKey.key);
    }
    return requestedPluginKeys;
  }

  #createRenderLayoutState(
    layout: DocRenderLayout,
    contentRect: DocEditorContentRect,
    blockRender?: DocBlockRenderDebugSnapshot,
  ): DocRenderLayoutState {
    return {
      viewport: this.#viewportEnvironment.getViewport(),
      contentRect,
      layoutCache: layout.layoutCache,
      blockLayoutDiff: layout.blockLayoutDiff,
      visibleBlocks: layout.visibleBlocks,
      documentRect: layout.documentRect,
      font: createDocFontDescriptor(this.#configEngine.getDefaultConfig()),
      scroll: this.#scrollManager.getState(),
      ...(blockRender ? { blockRender } : {}),
    };
  }

  #resolveBlockRasterCopyPlan(
    layout: DocRenderLayout,
    viewport: DocEditorViewport,
  ): ResolvedBlockRasterCopyPlan {
    const plan = this.#createBlockRasterCopyPlan(layout, viewport);
    if (!plan) return NO_INCREMENTAL_RENDER_PLAN;
    const candidate = createIncrementalRenderCandidate(plan);
    const decision = this.#incrementalRenderPolicy.evaluate(
      candidate,
      this.#configEngine.getDefaultConfig().incrementalRenderPolicyLimits,
    );
    return {
      plan: decision.accepted ? plan : null,
      decision,
      candidate,
    };
  }

  #createBlockRasterCopyPlan(layout: DocRenderLayout, viewport: DocEditorViewport): BlockRasterCopyPlan | null {
    const shiftedEntries = layout.blockLayoutDiff.getShiftedEntries();
    if (!layout.blockLayoutDiff.hasChanges() || shiftedEntries.length === 0) return null;
    const scrollState = this.#scrollManager.getRenderScrollState();
    const clearWorldRects = createAffectedTailClearRects(layout, viewport, scrollState);
    if (clearWorldRects.length === 0) return null;
    const invalidWorldRects = layout.blockLayoutDiff.getChangedEntries().flatMap((entry) => {
      const rects = [];
      if (entry.current) rects.push(toWorldBlockRenderRect(entry.current, layout.documentRect));
      return rects;
    });
    const copies: BlockRasterCopyCandidate[] = shiftedEntries.flatMap((entry) => {
      if (!entry.previous || !entry.current) return [];
      return [{
        source: toWorldBlockRenderRect(entry.previous, layout.documentRect),
        destination: toWorldBlockRenderRect(entry.current, layout.documentRect),
      }];
    });
    return BlockRasterCopyPlan.fromLayoutShift({
      viewport: { x: 0, y: 0, width: viewport.width, height: viewport.height },
      scrollState,
      clearWorldRects,
      copies,
      invalidWorldRects,
    });
  }

  #handleScrollReRender(): void {
    if (this.#scrollRenderFrame !== null) return;
    this.#scrollRenderFrame = this.#platform.requestAnimationFrame(this.#runScheduledScrollRender.bind(this));
  }

  #runScheduledScrollRender(): void {
    this.#scrollRenderFrame = null;
    if (!this.#lifecycle.isDestroyed()) this.#commands.run(RenderDocViewportCommand, void 0);
  }

  #updateViewport(): void {
    const viewport = this.#viewportEnvironment.getViewport();
    this.#renderEngine.setViewport({
      width: viewport.width,
      height: viewport.height,
      contentRect: this.#viewportEnvironment.getContentRect(),
    });
  }

  #updateTextInputPosition(cursorX: number, cursorY: number, composingCaretPixelOffset: number): void {
    const rootOffset = this.#viewportEnvironment.readRootViewOffset();
    const scroll = this.#scrollManager.getState();
    this.#textInput.setPosition(
      rootOffset.x + cursorX - scroll.x + composingCaretPixelOffset,
      rootOffset.y + cursorY - scroll.y,
    );
  }
}

const EMPTY_RENDER_OPERATIONS: DocRenderOperations = [];
const NO_INCREMENTAL_RENDER_DECISION: IncrementalRenderDecision = {
  accepted: false,
  reason: IncrementalRenderDecisionReason.NotCandidate,
};
const NO_INCREMENTAL_RENDER_PLAN: ResolvedBlockRasterCopyPlan = {
  plan: null,
  decision: NO_INCREMENTAL_RENDER_DECISION,
  candidate: null,
};

interface ResolvedBlockRasterCopyPlan {
  readonly plan: BlockRasterCopyPlan | null;
  readonly decision: IncrementalRenderDecision;
  readonly candidate: IncrementalRenderCandidate | null;
}

function collectRequestedRenderOperations(requests: readonly DocRenderRequest[]): DocRenderOperations {
  const renderOperations: DocRenderOperation[] = [];
  for (const request of requests) {
    const requestOperations = request.renderOperations;
    if (requestOperations === null) return null;
    if (requestOperations) renderOperations.push(...requestOperations);
  }
  return renderOperations;
}

function toWorldBlockRenderRect(
  block: { readonly rect: PositionRectProps; readonly flowHeight: number },
  origin: PositionRectProps,
): PositionRectProps {
  return {
    x: origin.x,
    y: origin.y + block.rect.y,
    width: origin.width,
    height: Math.max(block.rect.height, block.flowHeight, 1),
  };
}

function createAffectedTailClearRects(
  layout: DocRenderLayout,
  viewport: DocEditorViewport,
  scrollState: { readonly y: number },
): readonly PositionRectProps[] {
  const changedEntries = layout.blockLayoutDiff.getChangedEntries();
  if (changedEntries.length === 0) return [];
  let startY = Number.POSITIVE_INFINITY;
  for (const entry of changedEntries) {
    if (entry.previous) startY = Math.min(startY, toWorldBlockRenderRect(entry.previous, layout.documentRect).y);
    if (entry.current) startY = Math.min(startY, toWorldBlockRenderRect(entry.current, layout.documentRect).y);
  }
  if (!Number.isFinite(startY)) return [];
  const viewportBottom = scrollState.y + viewport.height;
  if (viewportBottom <= startY) return [];
  return [{
    x: layout.documentRect.x,
    y: startY,
    width: layout.documentRect.width,
    height: viewportBottom - startY,
  }];
}

function createBlockRenderDebugSnapshot(
  layout: DocRenderLayout,
  blockRasterCopyPlan: BlockRasterCopyPlan | null,
  frameMode: DocBlockRenderDebugSnapshot['frameMode'],
  decision: IncrementalRenderDecision,
  candidate: IncrementalRenderCandidate | null,
): DocBlockRenderDebugSnapshot {
  const changedBlocks = layout.blockLayoutDiff
    .getChangedEntries()
    .flatMap((entry) => (entry.current ? [toWorldBlockRenderRect(entry.current, layout.documentRect)] : []));
  const shiftedBlocks = layout.blockLayoutDiff
    .getShiftedEntries()
    .flatMap((entry) => (entry.current ? [toWorldBlockRenderRect(entry.current, layout.documentRect)] : []));
  const rasterCopies =
    blockRasterCopyPlan?.cacheToViewportCopies.map((copy) => ({
      source: copy.source,
      destination: copy.destination,
    })) ?? [];
  return {
    frameMode,
    incrementalRenderAccepted: decision.accepted,
    incrementalRenderReason: decision.reason,
    ...(candidate ? { incrementalRenderCandidate: createIncrementalRenderCandidateDebugMetrics(candidate) } : {}),
    changedBlocks,
    shiftedBlocks,
    reusedBlocks: layout.blockLayoutDiff
      .getShiftedEntries()
      .flatMap((entry) => (entry.current ? [toWorldBlockRenderRect(entry.current, layout.documentRect)] : [])),
    rasterCopies,
    invalidRedrawRects: blockRasterCopyPlan?.invalidWorldRects ?? changedBlocks,
    copiedPixelArea: rasterCopies.reduce(sumCopyDestinationArea, 0),
    redrawnBlockCount: changedBlocks.length,
    skippedBlockCount: rasterCopies.length,
  };
}

function createIncrementalRenderCandidateDebugMetrics(
  candidate: IncrementalRenderCandidate,
): NonNullable<DocBlockRenderDebugSnapshot['incrementalRenderCandidate']> {
  const viewportArea = candidate.viewport.width * candidate.viewport.height;
  return {
    copiedPixelArea: candidate.copiedArea,
    invalidPixelArea: candidate.invalidArea,
    copiedAreaRatio: viewportArea > 0 ? candidate.copiedArea / viewportArea : 0,
    invalidAreaRatio: viewportArea > 0 ? candidate.invalidArea / viewportArea : 0,
    copyCount: candidate.copyCount,
    invalidRectCount: candidate.invalidRectCount,
  };
}

function sumCopyDestinationArea(total: number, copy: BlockRasterCopyPlan['cacheToViewportCopies'][number]): number {
  return total + copy.destination.width * copy.destination.height;
}

function createIncrementalRenderCandidate(plan: BlockRasterCopyPlan): IncrementalRenderCandidate {
  return {
    viewport: plan.viewport,
    copiedArea: plan.cacheToViewportCopies.reduce(sumCopyDestinationArea, 0),
    invalidArea: plan.invalidWorldRects.reduce(sumRectArea, 0),
    copyCount: plan.cacheToViewportCopies.length,
    invalidRectCount: plan.invalidWorldRects.length,
  };
}

function sumRectArea(total: number, rect: Pick<PositionRectProps, 'width' | 'height'>): number {
  return total + rect.width * rect.height;
}
