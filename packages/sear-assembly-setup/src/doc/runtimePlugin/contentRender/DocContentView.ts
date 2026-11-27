import { DocCommandBus } from '@searsuite/sear-assembly-commands';
import { Pipeline } from '@searsuite/sear-assembly-plugin';
import { RenderDocCommand } from '../../DocViewCommands';
import { SearError } from '@searsuite/sear-foundation-error';
import { type DocRenderLayoutState, type SearCoreDoc } from '@searsuite/sear-assembly-core';
import { type DocBlockLayout } from '@searsuite/sear-domain-editor';
import { Injectable } from '@searsuite/sear-foundation-di';
import { RichTextBlockNode, RichTextLineRenderer, type Node, type NodeProperties } from '@searsuite/sear-render-node';
import { DocView, type DocViewRuntime, type DocViewSetupContext } from '../../DocViewContracts';
import { DocContentViewKey } from '../../DocViewKeys';

/** Default content renderer for text nodes laid out by the document layout engine. */
@Injectable()
export class DocContentView extends DocView {
  /** DI token for resolving DocContentView. */
  public static readonly symbol = Symbol.for('DocContentView');

  #runtime: DocViewRuntime | null = null;
  #lineRenderer: RichTextLineRenderer | null = null;

  /** Creates a DocContentView instance. */
  public constructor() {
    super(DocContentViewKey);
  }

  public registerCommands(commands: DocCommandBus): void {
    commands.register(RenderDocCommand, () => ({
      id: RenderDocCommand.id,
      execute: () => ({ pipeline: Pipeline.fromInvalidation(RenderDocCommand.id, this.key) }),
    }));
  }
  public render(searCore: SearCoreDoc): Node<NodeProperties>[] | null {
    const layout = searCore.getDocRenderLayoutState();
    if (!layout) return null;
    const nodes: Node<NodeProperties>[] = [];
    for (const block of layout.visibleBlocks) nodes.push(this.#createRichTextBlockNode(layout, block));
    return nodes;
  }

  public configure(context: DocViewSetupContext): void {
    this.#runtime = context.runtime;
    this.#lineRenderer = context.container.resolve(RichTextLineRenderer.symbol);
  }

  public destroyView(): void {
    this.assertRuntimeWriteAllowed();
    this.#runtime = null;
    this.#lineRenderer = null;
  }

  #createRichTextBlockNode(layout: DocRenderLayoutState, block: DocBlockLayout): RichTextBlockNode {
    // debugger;
    const lineRenderer = this.#lineRenderer;
    if (!lineRenderer) throw new SearError('DocContentView is not configured.');
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
