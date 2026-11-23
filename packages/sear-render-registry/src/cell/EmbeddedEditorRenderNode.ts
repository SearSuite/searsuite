import { PositionRect } from '@searsuite/sear-foundation-rect';
import { type Schema } from '@searsuite/sear-domain-doc-schema';
import { RenderContext } from '@searsuite/sear-render-context';
import {
  GenerationalDirtyTracker,
  RenderNode,
  TextNode,
  type ClipRegion,
  type NodeProperties,
} from '@searsuite/sear-render-node';
import {
  SheetEmbeddedEditor,
  type SheetDocument,
  type SheetEmbeddedEditorContext,
  type SheetEditorInvalidation,
  type SheetRenderSession,
  type SheetEditSession,
  type SheetEditRenderOptions,
} from '@searsuite/sear-sheet-editor-contract';

/**
 * Thin Sheet scene-graph bridge for an embedded rich-text editor.
 *
 * The embedded editor owns document layout and painting. This node only binds
 * the editor session to the cell geometry and forwards retained draw calls.
 */
export class EmbeddedEditorRenderNode<T extends NodeProperties = NodeProperties> extends RenderNode<T> {
  private readonly document: SheetDocument;
  private readonly fallbackText: string;
  private session: SheetRenderSession | null = null;
  private readonly editSession: SheetEditSession | null;
  private readonly editRenderOptions: SheetEditRenderOptions | undefined;
  private editorContext: SheetEmbeddedEditorContext | null = null;

  public constructor(
    document: readonly Schema[],
    positionRect: { x: number; y: number; width: number; height: number },
    properties: T,
    editSession?: SheetEditSession,
    editRenderOptions?: SheetEditRenderOptions,
  ) {
    super(positionRect, properties);
    // Cell boxes and their rich-text content can belong to elevated layers,
    // such as merged cells. Keep content above its owning box so dirty-pass
    // sorting cannot repaint the box over the text.
    this.depth = (properties.depth ?? 0) + 1;
    this.document = document as SheetDocument;
    this.fallbackText = flattenDocumentText(this.document);
    this.editSession = editSession ?? null;
    this.editRenderOptions = editRenderOptions;
  }

  protected override onRuntimeBound(): void {
    if (!this.hasEmbeddedEditor()) {
      if (!this.editSession && this.fallbackText) {
        this.add(new TextNode(this.fallbackText, this.positionRect, this.properties));
      }
      return;
    }

    const editor = this.resolveRuntime<SheetEmbeddedEditor>(SheetEmbeddedEditor.symbol);
    const renderContext = this.resolveRuntime<RenderContext>(RenderContext.symbol);
    const sheetConfig = this.configEngine.getDefaultConfig() as {
      readonly sheetCellFontSize?: number;
      readonly sheetCellFontFamily?: string;
    };
    const thisNode = this;
    const context: SheetEmbeddedEditorContext = {
      renderContext,
      defaultFontSize: sheetConfig.sheetCellFontSize,
      defaultFontFamily: sheetConfig.sheetCellFontFamily,
      geometry: {
        get cellRect() {
          return {
            x: thisNode.positionRect.x,
            y: thisNode.positionRect.y,
            width: thisNode.positionRect.width,
            height: thisNode.positionRect.height,
          };
        },
        get clipRect() {
          return {
            x: thisNode.positionRect.x,
            y: thisNode.positionRect.y,
            width: thisNode.positionRect.width,
            height: thisNode.positionRect.height,
          };
        },
        toLocalPoint: (point) => ({
          x: point.x - thisNode.positionRect.x,
          y: point.y - thisNode.positionRect.y,
        }),
        toSheetPoint: (point) => ({
          x: point.x + thisNode.positionRect.x,
          y: point.y + thisNode.positionRect.y,
        }),
        containsPoint: (point) =>
          point.x >= thisNode.positionRect.x &&
          point.y >= thisNode.positionRect.y &&
          point.x <= thisNode.positionRect.x + thisNode.positionRect.width &&
          point.y <= thisNode.positionRect.y + thisNode.positionRect.height,
      },
      documentAccessor: {
        read: () => thisNode.document,
        commit: () => {
          // Render sessions are read-only; edit sessions own commit handling.
        },
      },
      invalidate: (invalidation) => thisNode.markInvalidation(invalidation),
    };
    this.editorContext = context;
    if (!this.editSession) this.session = editor.createRenderSession(context);
  }

  public drawScene(context: RenderContext, clipRegion?: ClipRegion): void {
    if (this.editSession) {
      context.save();
      applyClip(context, clipRegion);
      applyClip(context, this.editorContext?.geometry.clipRect);
      this.editSession.render(context, this.editRenderOptions);
      context.restore();
      return;
    }
    if (!this.session) return;

    context.save();
    applyClip(context, clipRegion ?? this.editorContext?.geometry.clipRect);
    this.session.render(context);
    context.restore();
  }

  /** Rich-text content is visual-only; the cell box owns hit detection. */
  public drawHit(_context: RenderContext): void {}

  public clear(context: RenderContext): void {
    context.save();
    const lineWidth = context.getLineWidth();
    context.clearRect(
      this.positionRect.x - lineWidth / 2,
      this.positionRect.y - lineWidth / 2,
      this.positionRect.width + lineWidth,
      this.positionRect.height + lineWidth,
    );
    context.restore();
  }

  protected override onDisposed(): void {
    this.session?.dispose();
    this.session = null;
  }

  private hasEmbeddedEditor(): boolean {
    try {
      this.resolveRuntime<SheetEmbeddedEditor>(SheetEmbeddedEditor.symbol);
      return true;
    } catch (_error) {
      return false;
    }
  }

  private markInvalidation(invalidation: SheetEditorInvalidation): void {
    let dirtyTracker: GenerationalDirtyTracker;
    try {
      dirtyTracker = this.resolveRuntime<GenerationalDirtyTracker>(GenerationalDirtyTracker.symbol);
    } catch (_error) {
      return;
    }
    const rects = invalidation.rects?.length ? invalidation.rects : [this.editorContext?.geometry.cellRect];
    for (const rect of rects) {
      if (!rect) continue;
      dirtyTracker.mark(new PositionRect(rect.x, rect.y, rect.width, rect.height));
    }
  }
}

function flattenDocumentText(document: SheetDocument): string {
  return document.map(flattenNodeText).filter(Boolean).join('\n');
}

function flattenNodeText(node: Schema): string {
  if (typeof node.text === 'string') return node.text;
  return node.content?.map(flattenNodeText).filter(Boolean).join('') ?? '';
}

function applyClip(
  context: RenderContext,
  clipRegion?: ClipRegion | { x: number; y: number; width: number; height: number },
): void {
  if (!clipRegion) return;
  if (Array.isArray(clipRegion)) {
    if (clipRegion.length < 3) return;
    context.beginPath();
    context.moveTo(clipRegion[0][0], clipRegion[0][1]);
    for (let index = 1; index < clipRegion.length; index += 1) {
      context.lineTo(clipRegion[index][0], clipRegion[index][1]);
    }
    context.closePath();
    context.clip();
    return;
  }
  context.beginPath();
  context.rect(clipRegion.x, clipRegion.y, clipRegion.width, clipRegion.height);
  context.clip();
}
