import {
  DocCompositionManager,
  DocCursorManager,
  DocEditorLayout,
  type DocPreparedEditorRenderLayout,
} from '@searsuite/sear-assembly-core';
import {
  createBoldContribution,
  createFontFamilyContribution,
  createFontSizeContribution,
  createItalicContribution,
  createStrikethroughContribution,
  createTextColorContribution,
  createUnderlineContribution,
  SheetClipboardPlugin,
  SheetEmbeddedEditorPluginRegistry,
  SheetFormulaReferencePlugin,
  type SheetEmbeddedEditorPluginContext,
} from '@searsuite/sear-assembly-doc';
import {
  createDefaultRichTextLineBoxContribution,
  DocNodeRegistry,
  registerParagraphDocNode,
  registerTextDocNode,
  RichTextBlockFlowRegistry,
  RichTextInlineStyleRegistry,
  RichTextLineBoxRegistry,
  type DocSelection,
} from '@searsuite/sear-domain-doc';
import { DocLayoutEngine } from '@searsuite/sear-domain-editor';
import { SearError } from '@searsuite/sear-foundation-error';
import { PositionRect } from '@searsuite/sear-foundation-rect';
import { RenderContext } from '@searsuite/sear-render-context';
import { createFontDescriptor, RenderContextTextShaper } from '@searsuite/sear-render-metrics';
import {
  BlockManager,
  createBoldRenderContribution,
  createFontFamilyRenderContribution,
  createFontSizeRenderContribution,
  createItalicRenderContribution,
  createStrikethroughRenderContribution,
  createTextColorRenderContribution,
  createUnderlineRenderContribution,
  RichTextCaretNode,
  RichTextCompositionNode,
  RichTextContentNode,
  RichTextLineRenderer,
  RichTextRunRenderer,
  RichTextRunRenderRegistry,
  RichTextSelectionNode,
} from '@searsuite/sear-render-node';
import type { SheetDocument, SheetEditorRect, SheetEmbeddedEditorContext } from '@searsuite/sear-sheet-editor-contract';
import { cloneSheetDocument, lockSheetDocumentSnapshot } from './DocumentSnapshotBoundary';
import { defaultEmbeddedDocConfig } from './embeddedDocConfig';
import { SheetCellContextView } from './embeddedView/cellContext/SheetCellContextView';
import { SheetOverflowView } from './embeddedView/overflow/SheetOverflowView';
import { type SheetEmbeddedEditorViewContext } from './embeddedView/SheetEmbeddedEditorView';
import { SheetEmbeddedEditorViewRegistry } from './embeddedView/SheetEmbeddedEditorViewRegistry';
import { lockSheetEmbeddedEditorContext } from './lockSheetEmbeddedEditorContext';
import type { SearCoreEditorAdapterOptions } from './SearCoreEditorAdapterOptions';

/** Presentation-only Doc layout and drawing resources owned by one Sheet adapter. */
export class SearCoreEditorRuntime {
  public readonly layout: DocEditorLayout;
  public readonly cursor: DocCursorManager;
  public readonly composition: DocCompositionManager;
  public readonly inlineStyles: RichTextInlineStyleRegistry;
  public readonly runRenderRegistry: RichTextRunRenderRegistry;
  readonly #lineRenderer: RichTextLineRenderer;
  public readonly lineBoxes: RichTextLineBoxRegistry;
  public readonly fontSize: number;
  public readonly fontFamily: string;
  public readonly fontDescriptor: string;
  public readonly padding: number;
  public readonly sheetPlugins: SheetEmbeddedEditorPluginRegistry;
  public readonly sheetViews: SheetEmbeddedEditorViewRegistry;

  readonly #measurementContext: RenderContext;
  #destroyed = false;
  #isCommandExecuting: (() => boolean) | null = null;
  readonly #teardownToken = {};
  #ownerToken: object | null = null;

  public constructor(context: SheetEmbeddedEditorContext, options: SearCoreEditorAdapterOptions) {
    lockSheetEmbeddedEditorContext(context);
    this.#measurementContext = context.renderContext;
    this.fontSize = options.embeddedDocConfig?.fontSize ?? defaultEmbeddedDocConfig.fontSize;
    this.fontFamily = options.embeddedDocConfig?.fontFamily ?? defaultEmbeddedDocConfig.fontFamily;
    this.fontDescriptor = createFontDescriptor({ fontSize: this.fontSize, fontFamily: this.fontFamily });
    this.padding = options.embeddedDocConfig?.padding ?? defaultEmbeddedDocConfig.padding;
    this.sheetPlugins = new SheetEmbeddedEditorPluginRegistry();
    const plugins = options.plugins ?? [new SheetClipboardPlugin(), new SheetFormulaReferencePlugin()];
    plugins.forEach((plugin) => this.sheetPlugins.register(typeof plugin === 'function' ? new plugin() : plugin));
    const initialDocument = lockSheetDocumentSnapshot(cloneSheetDocument(context.documentAccessor.read()));
    this.sheetPlugins.initialize(this.pluginContext(initialDocument));
    this.sheetViews = new SheetEmbeddedEditorViewRegistry();
    const views = options.viewExtensions ?? [new SheetCellContextView(), new SheetOverflowView()];
    try {
      views.forEach((view) => this.sheetViews.register(typeof view === 'function' ? new view() : view));
      this.sheetViews.initialize(this.viewContext(context, initialDocument));
    } catch (error) {
      this.sheetViews.dispose();
      this.sheetPlugins.dispose();
      throw error;
    }

    const textShaper =
      options.createTextShaper?.(context.renderContext) ?? new RenderContextTextShaper(context.renderContext);
    this.inlineStyles = new RichTextInlineStyleRegistry();
    this.inlineStyles.register(createFontFamilyContribution());
    this.inlineStyles.register(createFontSizeContribution());
    this.inlineStyles.register(createBoldContribution());
    this.inlineStyles.register(createItalicContribution());
    this.inlineStyles.register(createUnderlineContribution());
    this.inlineStyles.register(createStrikethroughContribution());
    this.inlineStyles.register(createTextColorContribution());
    this.runRenderRegistry = new RichTextRunRenderRegistry();
    this.runRenderRegistry.register(createFontFamilyRenderContribution());
    this.runRenderRegistry.register(createFontSizeRenderContribution());
    this.runRenderRegistry.register(createBoldRenderContribution());
    this.runRenderRegistry.register(createItalicRenderContribution());
    this.runRenderRegistry.register(createUnderlineRenderContribution());
    this.runRenderRegistry.register(createStrikethroughRenderContribution());
    this.runRenderRegistry.register(createTextColorRenderContribution());
    const runRenderer = new RichTextRunRenderer(this.runRenderRegistry);
    this.#lineRenderer = new RichTextLineRenderer(this.inlineStyles, runRenderer);
    this.lineBoxes = new RichTextLineBoxRegistry();
    this.lineBoxes.register(createDefaultRichTextLineBoxContribution());
    const nodes = new DocNodeRegistry();
    registerParagraphDocNode(nodes);
    registerTextDocNode(nodes);
    const blockManager = new BlockManager(
      textShaper,
      this.inlineStyles,
      this.runRenderRegistry,
      this.lineBoxes,
      this.fontDescriptor,
    );
    this.cursor = new DocCursorManager();
    this.composition = new DocCompositionManager(textShaper);
    const layout = new DocLayoutEngine(new RichTextBlockFlowRegistry());
    this.layout = new DocEditorLayout(blockManager, this.cursor, this.composition, layout, nodes);
    this.layout.enforceTeardownBoundary(this.#teardownToken);
    if (context.isCommandExecuting) this.enforceCommandBoundary(context.isCommandExecuting);
  }

  /** Binds embedded plugin and document writes to the owning Sheet command bus. */
  public enforceCommandBoundary(isCommandExecuting: () => boolean): void {
    if (this.#isCommandExecuting) throw new SearError('Sheet embedded runtime command boundary is already installed.');
    this.#isCommandExecuting = isCommandExecuting;
    DocEditorLayout.prototype.enforceCommandBoundary.call(this.layout, isCommandExecuting);
    BlockManager.prototype.enforceCommandBoundary.call(this.layout.blockManager, isCommandExecuting);
    DocCursorManager.prototype.enforceCommandBoundary.call(this.cursor, isCommandExecuting, this.#teardownToken);
    DocCompositionManager.prototype.enforceCommandBoundary.call(
      this.composition,
      isCommandExecuting,
      this.#teardownToken,
    );
    const assertWrite = (): void => {
      if (!isCommandExecuting())
        throw new SearError('Sheet embedded extensions must change through editor.commands.run(...).');
    };
    SheetEmbeddedEditorPluginRegistry.prototype.enforceWriteBoundary.call(
      this.sheetPlugins,
      assertWrite,
      this.#teardownToken,
    );
    SheetEmbeddedEditorViewRegistry.prototype.enforceWriteBoundary.call(
      this.sheetViews,
      assertWrite,
      this.#teardownToken,
    );
    RichTextInlineStyleRegistry.prototype.enforceWriteBoundary.call(this.inlineStyles, assertWrite);
    RichTextRunRenderRegistry.prototype.enforceWriteBoundary.call(this.runRenderRegistry, assertWrite);
    RichTextLineBoxRegistry.prototype.enforceWriteBoundary.call(this.lineBoxes, assertWrite);
  }

  public bindTeardownToken(token: object): void {
    if (this.#ownerToken) throw new SearError('Sheet embedded runtime teardown is already bound.');
    this.#ownerToken = token;
  }

  public measureUnwrapped(document: SheetDocument, font: string): { width: number; height: number } {
    this.#assertLive();
    const blocks = this.layout.blockManager.createDetached();
    blocks.setBaseFont(font);
    for (const node of this.layout.materializeSnapshot(document)) blocks.add(node);
    return blocks.getUnwrappedSize();
  }

  public prepare(
    context: SheetEmbeddedEditorContext,
    document: SheetDocument,
    selection: DocSelection,
    cursorVisible: boolean,
    renderContext = context.renderContext,
    font = this.fontDescriptor,
  ): DocPreparedEditorRenderLayout {
    this.#assertLive();
    return this.#withFont(renderContext, font, () =>
      this.#withFont(this.#measurementContext, font, () =>
        this.layout.prepareEditorRenderLayout({
          document: this.layout.materializeSnapshot(document),
          selection,
          origin: context.geometry.cellRect,
          minWidth: context.geometry.cellRect.width,
          minHeight: context.geometry.cellRect.height,
          padding: this.padding,
          fitContentWidth: false,
          verticalAlign: 'center',
          font,
          cursorVisible,
          compositionProvider: this.composition,
        }),
      ),
    );
  }

  public draw(
    context: SheetEmbeddedEditorContext,
    document: SheetDocument,
    selection: DocSelection,
    renderContext: RenderContext,
    clipRect?: SheetEditorRect,
    cursorVisible = false,
    fontOverride?: string,
  ): DocPreparedEditorRenderLayout {
    const font = fontOverride ?? this.#resolveContextFont(context);
    const prepared = this.#withFont(renderContext, font, () =>
      this.prepare(context, document, selection, cursorVisible, renderContext, font),
    );
    const node = new RichTextContentNode({
      nodeKey: 'sheet-embedded-doc:content',
      rect: prepared.positionRect,
      lines: prepared.snapshot.lines,
      origin: { x: prepared.positionRect.x, y: prepared.positionRect.y },
      font,
      lineRenderer: this.#lineRenderer,
    });
    node.drawScene(
      renderContext,
      clipRect ? new PositionRect(clipRect.x, clipRect.y, clipRect.width, clipRect.height) : void 0,
    );
    return prepared;
  }

  /** Paints the complete active edit surface, including selection, composition and caret. */
  public drawEditor(
    context: SheetEmbeddedEditorContext,
    document: SheetDocument,
    selection: DocSelection,
    renderContext: RenderContext,
    cursorVisible = true,
  ): DocPreparedEditorRenderLayout {
    // Keep the requested blink phase when preparing the frame. The read-only
    // draw path hides the caret by default, so editing passes its visibility
    // explicitly before the caret node is painted.
    const prepared = this.draw(
      context,
      document,
      selection,
      renderContext,
      context.geometry.clipRect,
      cursorVisible,
      this.fontDescriptor,
    );
    const rect = prepared.positionRect;
    new RichTextSelectionNode({
      nodeKey: 'sheet-embedded-doc:selection',
      rect,
      rects: this.cursor.getSelectionRects(),
    }).drawScene(renderContext);
    const cursor = this.cursor.getCursor();
    if (!cursor) return prepared;
    new RichTextCompositionNode({
      nodeKey: 'sheet-embedded-doc:composition',
      rect,
      text: this.composition.getText(),
      anchor: { x: cursor.x, y: cursor.y, height: cursor.height || 10 },
      scroll: { x: 0, y: 0 },
      viewportOverlay: false,
    }).drawScene(renderContext);
    new RichTextCaretNode({
      nodeKey: 'sheet-embedded-doc:caret',
      rect,
      caret: {
        x: cursor.x,
        y: cursor.y,
        height: cursor.height || 10,
        visible: cursor.visible,
        pixelOffset: this.composition.getCaretPixelOffset(),
      },
      scroll: { x: 0, y: 0 },
      viewportOverlay: false,
    }).drawScene(renderContext);
    return prepared;
  }

  public destroy(ownerToken?: object): void {
    if (this.#destroyed) return;
    if (this.#ownerToken && ownerToken !== this.#ownerToken) {
      throw new SearError('Sheet embedded runtime destruction requires its editor owner.');
    }
    this.#destroyed = true;
    this.sheetViews.dispose(this.#teardownToken);
    this.sheetPlugins.dispose(this.#teardownToken);
    this.layout.destroy(this.#teardownToken);
    this.cursor.clearCursor(this.#teardownToken);
    this.composition.clear(this.#teardownToken);
  }

  public pluginContext(document: SheetDocument): SheetEmbeddedEditorPluginContext {
    return Object.freeze({ document: lockSheetDocumentSnapshot(document) });
  }

  public viewContext(context: SheetEmbeddedEditorContext, document: SheetDocument): SheetEmbeddedEditorViewContext {
    return Object.freeze({ editor: context, document: lockSheetDocumentSnapshot(document) });
  }

  #withFont<T>(context: RenderContext, font: string, callback: () => T): T {
    context.save();
    context.setFont(font);
    try {
      return callback();
    } finally {
      context.restore();
    }
  }

  #resolveContextFont(context: SheetEmbeddedEditorContext): string {
    return createFontDescriptor({
      fontSize: context.defaultFontSize ?? this.fontSize,
      fontFamily: context.defaultFontFamily ?? this.fontFamily,
    });
  }

  #assertLive(): void {
    if (this.#destroyed) throw new SearError('SearCoreEditorAdapter runtime has been disposed.');
  }
}
