import { SearContractViolationError } from '@searsuite/sear-assembly-plugin';
import { DocNodeRegistry, type DocCursorPos, type DocSelection, type RichDocNode } from '@searsuite/sear-domain-doc';
import { type Schema } from '@searsuite/sear-domain-doc-schema';
import { lockLayoutSnapshot, type DocVerticalAlign, type LayoutSnapshot } from '@searsuite/sear-domain-editor';
import { type PositionRectProps } from '@searsuite/sear-foundation-rect';
import { BlockManager } from '@searsuite/sear-render-node';
import { DocCompositionManager, type DocCompositionLayout, type DocCompositionProvider } from './DocCompositionManager';
import { DocCursorManager } from './DocCursorManager';

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

/** Derives layout, selection and caret geometry without constructing business state or plugins. */
export class DocEditorLayout {
  readonly #docCursorManager: DocCursorManager;
  readonly #docCompositionManager: DocCompositionManager;
  readonly #docLayoutEngine: import('@searsuite/sear-domain-editor').DocLayoutEngine;
  readonly #nodes: DocNodeRegistry;
  readonly #onLayout: ((snapshot: LayoutSnapshot) => void) | undefined;
  readonly #defaultPadding = 0;
  #commandBoundaryCheck: (() => boolean) | undefined;
  #lastLayoutSnapshot: LayoutSnapshot | null = null;
  #teardownToken: object | undefined;
  #destroyed = false;
  public constructor(
    public readonly blockManager: BlockManager,
    cursor: DocCursorManager,
    composition: DocCompositionManager,
    layout: import('@searsuite/sear-domain-editor').DocLayoutEngine,
    nodes: DocNodeRegistry,
    onLayout?: (snapshot: LayoutSnapshot) => void,
  ) {
    this.#docCursorManager = cursor;
    this.#docCompositionManager = composition;
    this.#docLayoutEngine = layout;
    this.#nodes = nodes;
    this.#onLayout = onLayout;
  }
  /** Protects derived view caches without granting business-state authority. */
  public enforceCommandBoundary(isExecuting: () => boolean): void {
    if (this.#commandBoundaryCheck)
      throw new SearContractViolationError('Doc layout command boundary is already installed.');
    this.#commandBoundaryCheck = isExecuting;
    Object.defineProperty(this, 'blockManager', { writable: false, configurable: false });
  }
  public enforceTeardownBoundary(token: object): void {
    if (this.#teardownToken) throw new SearContractViolationError('Doc layout cleanup is already owned.');
    this.#teardownToken = token;
  }
  public destroy(token?: object): void {
    if (this.#destroyed) return;
    if (this.#teardownToken && this.#teardownToken !== token)
      throw new SearContractViolationError('Doc layout destruction requires its editor owner.');
    this.#destroyed = true;
    this.#lastLayoutSnapshot = null;
  }

  #generateDocNodeFromString(content: string): RichDocNode[] {
    return [
      this.#nodes.create({
        type: this.#nodes.requireDefaultBlockType(),
        content: [this.#nodes.create({ type: this.#nodes.requireDefaultTextType(), text: content })],
      }),
    ];
  }

  #prepareLayoutDocument(state: RichDocNode[] | string, blockManager: BlockManager): void {
    blockManager.clear();
    const richContent = typeof state === 'string' ? this.#generateDocNodeFromString(state) : state;
    for (const node of richContent) {
      const documentNode = this.#nodes.create(node);
      blockManager.add(documentNode);
    }
  }

  /** Converts a shared snapshot into detached runtime nodes without changing Core state. */
  public materializeSnapshot(snapshot: readonly Schema[]): RichDocNode[] {
    return cloneRichDocumentSnapshot(snapshot).map((node) => this.#nodes.create(node));
  }

  /** Returns the latest document layout snapshot prepared by Core. */
  public getLayoutSnapshot(): LayoutSnapshot | null {
    return this.#lastLayoutSnapshot;
  }

  /**
   * Prepares the current editable document frame through the Doc-owned layout
   * path used by standalone document hosts and embedded editors.
   */
  public prepareEditorRenderLayout(input: DocEditorRenderLayoutInput): DocPreparedEditorRenderLayout {
    if (this.#destroyed) throw new SearContractViolationError('Doc layout is destroyed.');
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
    this.#onLayout?.(prepared.snapshot);
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
}

function cloneRichDocumentSnapshot(document: readonly Schema[]): Schema[] {
  return JSON.parse(JSON.stringify(document)) as Schema[];
}
