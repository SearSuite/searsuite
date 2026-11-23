import { SearError } from '@searsuite/sear-foundation-error';
import { type DocRenderLayoutState, type SearCoreDoc } from '@searsuite/sear-assembly-core';
import { type DocBlockLayout } from '@searsuite/sear-domain-editor';
import { Injectable } from '@searsuite/sear-foundation-di';
import { RichTextBlockNode, RichTextLineRenderer, type Node, type NodeProperties } from '@searsuite/sear-render-node';
import { DocPlugin, type DocPluginRuntime, type DocPluginSetupContext } from '@searsuite/sear-assembly-doc';
import { DocContentRenderPluginKey } from '@searsuite/sear-assembly-doc';

/** Default content renderer for text nodes laid out by the document layout engine. */
@Injectable()
export class DocContentRenderPlugin extends DocPlugin<null> {
  /** DI token for resolving DocContentRenderPlugin. */
  public static readonly symbol = Symbol.for('DocContentRenderPlugin');

  private runtime: DocPluginRuntime | null = null;
  private lineRenderer: RichTextLineRenderer | null = null;

  /** Creates a DocContentRenderPlugin instance. */
  public constructor() {
    super({ key: DocContentRenderPluginKey, state: null });
  }

  public registerState() {
    return { key: this.key, state: null };
  }

  public apply(_state: null, _transaction: unknown): null {
    return null;
  }

  public getPluginConfig(): null {
    return null;
  }

  public render(searCore: SearCoreDoc): Node<NodeProperties>[] | null {
    const layout = searCore.getDocRenderLayoutState();
    if (!layout) return null;
    const nodes: Node<NodeProperties>[] = [];
    for (const block of layout.visibleBlocks) nodes.push(this.createRichTextBlockNode(layout, block));
    return nodes;
  }

  public configure(context: DocPluginSetupContext): void {
    this.runtime = context.runtime;
    this.lineRenderer = context.container.resolve(RichTextLineRenderer.symbol);
  }

  public onEditorDestroy(): void {
    this.assertRuntimeWriteAllowed();
    this.runtime = null;
    this.lineRenderer = null;
  }

  private createRichTextBlockNode(layout: DocRenderLayoutState, block: DocBlockLayout): RichTextBlockNode {
    // debugger;
    const lineRenderer = this.lineRenderer;
    if (!lineRenderer) throw new SearError('DocContentRenderPlugin is not configured.');
    const lines = layout.layoutCache.snapshot.lines.slice(block.lineStart, block.lineEnd);
    return new RichTextBlockNode({
      block,
      lines,
      font: layout.font,
      rect: {
        x: layout.documentRect.x,
        y: layout.documentRect.y + block.rect.y,
        width: layout.documentRect.width,
        height: Math.max(block.rect.height, block.flowHeight, 1),
      },
      origin: layout.documentRect,
      lineRenderer,
    });
  }
}
