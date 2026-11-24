import { ConfigEngine } from '@searsuite/sear-assembly-config';
import { DocCommandBus } from '@searsuite/sear-assembly-commands';
import {
  collectDocReflowBlockIds,
  collectDocRepaintBlockIds,
  DocCompositionManager,
  DocCursorManager,
  DocInputPlugin,
  type DocCompositionProvider,
  type DocRenderOperations,
} from '@searsuite/sear-assembly-core';
import {
  DocLayoutCache,
  DocBlockLayoutDiff,
  DocLayoutEngine,
  DocPageMap,
  type DocBlockLayout,
} from '@searsuite/sear-domain-editor';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';
import { PositionRect } from '@searsuite/sear-foundation-rect';
import { type HexColor } from '@searsuite/sear-foundation-utils';
import { type RichTextParagraphLayoutDefaults } from '@searsuite/sear-domain-doc';
import { RenderContext } from '@searsuite/sear-render-context';
import { Tree } from '@searsuite/sear-render-node';
import { ScrollManager } from '@searsuite/sear-render-scroll';
import { type DocEditorContentRect, type DocEditorViewport } from './createDocEditor';
import {
  type DocEditorRuntimeConfiguration,
  DocEditorRuntimeConfigurationSymbol,
} from './DocEditorRuntimeConfiguration';
import { DocPluginRuntimeCapability } from '@searsuite/sear-assembly-doc';
import { DocRuntimeExtensionRegistry } from '@searsuite/sear-assembly-doc';
import {
  DocVirtualLayoutStore,
  type DocBlockRenderDebugSnapshot,
  type DocVirtualLayoutSummary,
} from './DocVirtualLayoutStore';
import { createDocFontDescriptor } from './createDocFontDescriptor';
import { lockDocVirtualLayoutSummary } from './lockDocVirtualLayoutSummary';

export type DocVirtualLayoutSummaryListener = (summary: DocVirtualLayoutSummary) => void;
export type DocRenderPrepareMode = 'full' | 'viewport';
const EMPTY_RENDER_OPERATIONS: DocRenderOperations = [];

/** Layout/cache/page-map result exposed to document plugins for one render pass. */
export interface DocRenderLayout {
  /** Latest full-document layout cache. */
  readonly layoutCache: DocLayoutCache;
  /** Block-level diff between the previous and current layout caches. */
  readonly blockLayoutDiff: DocBlockLayoutDiff;
  /** Latest page map derived from the layout cache. */
  readonly pageMap: DocPageMap;
  /** Laid-out blocks selected for plugin-owned render nodes. */
  readonly visibleBlocks: readonly DocBlockLayout[];
  /** Current document layout rectangle in world coordinates. */
  readonly documentRect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /** Cursor x in world coordinates. */
  readonly cursorX: number;
  /** Cursor y in world coordinates. */
  readonly cursorY: number;
  /** Pixel offset from composing-text start to the IME caret. */
  readonly composingCaretPixelOffset: number;
}

/** Owns Doc layout cache, page map, and viewport range derivation. */
@Injectable()
export class DocRenderLayoutService {
  readonly #inputPlugin: DocInputPlugin;
  readonly #extensions: DocRuntimeExtensionRegistry;
  readonly #renderContext: RenderContext;
  readonly #scrollManager: ScrollManager;
  readonly #sceneTree: Tree<PositionRect<HexColor>>;
  readonly #configuration: DocEditorRuntimeConfiguration;
  readonly #configEngine: ConfigEngine;
  readonly #cursorManager: DocCursorManager;
  readonly #compositionProvider: DocCompositionProvider;
  readonly #layoutEngine: DocLayoutEngine;
  readonly #virtualLayouts: DocVirtualLayoutStore;
  readonly #commands: DocCommandBus;

  /** DI token for resolving the render-layout service. */
  public static readonly symbol = Symbol.for('DocRenderLayoutService');

  #previousContentBoundary: readonly [number, number] | null = null;
  #previousSceneBoundary: readonly [number, number] | null = null;
  readonly #virtualLayoutSummaryListeners = new Set<DocVirtualLayoutSummaryListener>();
  #latestVirtualLayoutSummary: DocVirtualLayoutSummary | null = null;
  #latestRenderLayout: DocRenderLayout | null = null;
  #initialLoadMs: number | null = null;
  #renderedSummaryCount = 0;

  /** Creates a render-layout service for one standalone document editor. */
  public constructor(
    @Inject(DocInputPlugin.symbol)
    inputPlugin: DocInputPlugin,
    @Inject(DocRuntimeExtensionRegistry.symbol)
    extensions: DocRuntimeExtensionRegistry,
    @Inject(RenderContext.symbol)
    renderContext: RenderContext,
    @Inject(ScrollManager.symbol)
    scrollManager: ScrollManager,
    @Inject(Tree.symbol)
    sceneTree: Tree<PositionRect<HexColor>>,
    @Inject(DocEditorRuntimeConfigurationSymbol)
    configuration: DocEditorRuntimeConfiguration,
    @Inject(ConfigEngine.symbol)
    configEngine: ConfigEngine,
    @Inject(DocCursorManager.symbol)
    cursorManager: DocCursorManager,
    @Inject(DocCompositionManager.symbol)
    compositionProvider: DocCompositionProvider,
    @Inject(DocLayoutEngine.symbol)
    layoutEngine: DocLayoutEngine,
    @Inject(DocVirtualLayoutStore.symbol)
    virtualLayouts: DocVirtualLayoutStore,
    @Inject(DocCommandBus.symbol)
    commands: DocCommandBus,
  ) {
    this.#inputPlugin = inputPlugin;
    this.#extensions = extensions;
    this.#renderContext = renderContext;
    this.#scrollManager = scrollManager;
    this.#sceneTree = sceneTree;
    this.#configuration = configuration;
    this.#configEngine = configEngine;
    this.#cursorManager = cursorManager;
    this.#compositionProvider = compositionProvider;
    this.#layoutEngine = layoutEngine;
    this.#virtualLayouts = virtualLayouts;
    this.#commands = commands;
    Object.freeze(this);
  }

  #assertCommandWrite(): void {
    if (!this.#commands.isExecuting()) throw new SearError('Doc layout changes must run through editor.commands.run(...).');
  }

  /** Clears cached layout and page state. */
  public reset(): void {
    this.#assertCommandWrite();
    this.#virtualLayouts.reset();
    this.#latestVirtualLayoutSummary = null;
    this.#latestRenderLayout = null;
    this.#initialLoadMs = null;
    this.#renderedSummaryCount = 0;
  }

  public getLatestVirtualLayoutSummary(): DocVirtualLayoutSummary | null {
    return this.#latestVirtualLayoutSummary ?? this.#virtualLayouts.getLatestSummary();
  }

  public subscribeVirtualLayoutSummary(listener: DocVirtualLayoutSummaryListener): () => void {
    this.#virtualLayoutSummaryListeners.add(listener);
    const latestSummary = this.getLatestVirtualLayoutSummary();
    if (latestSummary) listener(latestSummary);
    const service = this;
    return function unsubscribeVirtualLayoutSummary(): void {
      service.#virtualLayoutSummaryListeners.delete(listener);
    };
  }

  public recordRenderPrepareTiming(mode: DocRenderPrepareMode, durationMs: number): void {
    this.#assertCommandWrite();
    const latestSummary = this.getLatestVirtualLayoutSummary();
    if (!latestSummary) return;
    const renderPhase = this.#renderedSummaryCount === 0 ? 'initial' : 'realtime';
    if (renderPhase === 'initial') this.#initialLoadMs = durationMs;
    this.#latestVirtualLayoutSummary = lockDocVirtualLayoutSummary({
      ...latestSummary,
      renderPhase,
      ...(this.#initialLoadMs === null ? {} : { initialLoadMs: this.#initialLoadMs }),
      timings: {
        ...latestSummary.timings,
        renderPrepareMode: mode,
        renderPrepareMs: durationMs,
      },
    });
    this.#renderedSummaryCount += 1;
    this.#publishVirtualLayoutSummary();
  }

  /** Records block-render reuse/debug stats for the latest render frame. */
  public recordBlockRenderDebugSnapshot(snapshot: DocBlockRenderDebugSnapshot): void {
    this.#assertCommandWrite();
    const latestSummary = this.getLatestVirtualLayoutSummary();
    if (!latestSummary) return;
    this.#latestVirtualLayoutSummary = lockDocVirtualLayoutSummary({
      ...latestSummary,
      blockRender: snapshot,
    });
    this.#publishVirtualLayoutSummary();
  }

  /** Builds the current render layout before plugins produce render nodes. */
  public prepareRenderLayout(
    contentRect: DocEditorContentRect,
    viewport: DocEditorViewport,
    renderOperations: DocRenderOperations = EMPTY_RENDER_OPERATIONS,
  ): DocRenderLayout {
    this.#assertCommandWrite();
    const doc = this.#inputPlugin.session.pendingDoc;
    const defaultConfig = this.#configEngine.getDefaultConfig();
    const reflowBlockIds = collectDocReflowBlockIds(renderOperations, doc);
    const repaintBlockIds = collectDocRepaintBlockIds(renderOperations, doc);
    const layout = this.#virtualLayouts.prepare({
      contentRect,
      viewport,
      document: doc,
      selection: this.#inputPlugin.session.docSelection,
      verticalAlign: defaultConfig.docVerticalAlign,
      font: createDocFontDescriptor(defaultConfig),
      paragraphLayoutDefaults: {
        lineSpacing: { mode: 'multiple', value: defaultConfig.docLineHeightMultiplier },
        spacingAfter: defaultConfig.docParagraphSpacingAfter,
      } satisfies RichTextParagraphLayoutDefaults,
      cursorVisible: this.#extensions.get(DocPluginRuntimeCapability.CaretState)?.isVisible() ?? true,
      reflowBlockIds,
      repaintBlockIds,
    });
    this.#updateContentBoundary(
      Math.max(0, layout.documentRect.width - contentRect.width),
      Math.max(0, layout.documentRect.height - contentRect.height),
    );
    this.#updateSceneBoundary(
      layout.documentRect.x + layout.documentRect.width,
      layout.documentRect.y + layout.documentRect.height,
    );
    this.#latestVirtualLayoutSummary = this.#virtualLayouts.getLatestSummary();
    const blockLayoutDiff = DocBlockLayoutDiff.compare(
      this.#latestRenderLayout?.layoutCache ?? null,
      layout.layoutCache,
      {
        reflowBlockIds: resolveFullReflowBlockIds(reflowBlockIds, layout.layoutCache),
        repaintBlockIds,
      },
    );
    const result = Object.freeze({
      layoutCache: layout.layoutCache,
      blockLayoutDiff,
      pageMap: layout.pageMap,
      visibleBlocks: layout.visibleBlocks,
      documentRect: layout.documentRect,
      cursorX: layout.cursorX,
      cursorY: layout.cursorY,
      composingCaretPixelOffset: layout.composingCaretPixelOffset,
    });
    this.#latestRenderLayout = result;
    return result;
  }

  /** Reuses the previous full-document layout and updates only viewport-derived fields. */
  public prepareViewportLayout(contentRect: DocEditorContentRect, viewport: DocEditorViewport): DocRenderLayout {
    return this.prepareRenderLayout(contentRect, viewport);
  }

  /** Reuses the latest layout snapshot and refreshes selection/caret geometry only. */
  public refreshInteractionLayout(
    contentRect: DocEditorContentRect,
    _viewport: DocEditorViewport,
  ): DocRenderLayout | null {
    this.#assertCommandWrite();
    const latest = this.#latestRenderLayout;
    if (!latest || !isSameContentRect(latest.documentRect, contentRect)) return null;
    const selection = this.#inputPlugin.session.docSelection;
    const cursorRelative = this.#layoutEngine.cursorToPoint(selection.head, latest.layoutCache.snapshot);
    const composingCaretPixelOffset = this.#compositionProvider.measure(
      createDocFontDescriptor(this.#configEngine.getDefaultConfig()),
    ).caretPixelOffset;
    this.#cursorManager.setCursor({
      x: latest.documentRect.x + cursorRelative.x,
      y: latest.documentRect.y + cursorRelative.y,
      height: cursorRelative.height,
      visible: this.#extensions.get(DocPluginRuntimeCapability.CaretState)?.isVisible() ?? true,
    });
    this.#cursorManager.setSelectionRects(
      this.#layoutEngine.getSelectionRects(
        selection,
        latest.layoutCache.snapshot,
        latest.documentRect.x,
        latest.documentRect.y,
      ),
    );
    const result = Object.freeze({
      ...latest,
      cursorX: latest.documentRect.x + cursorRelative.x,
      cursorY: latest.documentRect.y + cursorRelative.y,
      composingCaretPixelOffset,
    });
    this.#latestRenderLayout = result;
    return result;
  }

  #updateContentBoundary(maxWidth: number, maxHeight: number): void {
    const next: readonly [number, number] = [maxWidth, maxHeight];
    if (this.#previousContentBoundary?.[0] === next[0] && this.#previousContentBoundary[1] === next[1]) return;
    this.#scrollManager.setContentBoundary(next[0], next[1]);
    this.#previousContentBoundary = next;
  }

  #publishVirtualLayoutSummary(): void {
    const latestSummary = this.getLatestVirtualLayoutSummary();
    if (!latestSummary) return;
    this.#virtualLayoutSummaryListeners.forEach(function notifyVirtualLayoutSummary(listener) {
      listener(latestSummary);
    });
  }

  #updateSceneBoundary(width: number, height: number): void {
    const next: readonly [number, number] = [Math.max(1, width), Math.max(1, height)];
    if (this.#previousSceneBoundary?.[0] === next[0] && this.#previousSceneBoundary[1] === next[1]) return;
    this.#sceneTree.updateBoundary(new PositionRect<HexColor>(0, 0, next[0], next[1]));
    this.#previousSceneBoundary = next;
  }
}

function resolveFullReflowBlockIds(
  reflowBlockIds: ReturnType<typeof collectDocReflowBlockIds>,
  layoutCache: DocLayoutCache,
): ReadonlySet<(typeof layoutCache.blocks)[number]['id']> {
  if (reflowBlockIds) return reflowBlockIds;
  return new Set(layoutCache.blocks.map((block) => block.id));
}

function isSameContentRect(
  documentRect: { readonly x: number; readonly y: number; readonly width: number },
  contentRect: DocEditorContentRect,
): boolean {
  return (
    documentRect.x === contentRect.x && documentRect.y === contentRect.y && documentRect.width === contentRect.width
  );
}
