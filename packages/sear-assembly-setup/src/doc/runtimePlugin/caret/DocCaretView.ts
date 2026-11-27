import { SearError } from '@searsuite/sear-foundation-error';
import { type DocRenderLayoutState } from '@searsuite/sear-assembly-core';

import { DocCursorDirection } from '@searsuite/sear-domain-commands';
import { Inject, Injectable, Scope } from '@searsuite/sear-foundation-di';
import { RichTextCaretNode, RichTextCompositionNode, type Node, type NodeProperties } from '@searsuite/sear-render-node';
import { MoveDocCursorCommand } from '@searsuite/sear-assembly-doc';
import { DocView, type DocViewRuntime, type DocViewServiceContext, type DocViewSetupContext } from '../../DocViewContracts';
import { type DocKeyboardHandlerRegistrationContext } from '../../DocViewContracts';
import { DocCaretState } from '../../DocCaretState';
import { DocViewRuntimeCapability } from '../../DocViewCapabilities';

import { DocCaretViewKey } from '../../DocViewKeys';

/** Owns caret movement, focus, blink state, and caret overlay rendering. */
@Injectable()
export class DocCaretView extends DocView {
  readonly #caretState: DocCaretState;

  /** DI token for resolving DocCaretView. */
  public static readonly symbol = Symbol.for('DocCaretView');

  #runtime: DocViewRuntime | null = null;

  /** Creates a DocCaretView instance. */
  public constructor(
    @Inject(DocCaretState.symbol)
    caretState: DocCaretState,
  ) {
    super(DocCaretViewKey);
    this.#caretState = caretState;
  }

  /** Registers caret-owned state before the plugin is resolved. */
  public static registerServices(context: DocViewServiceContext): void {
    context.container.register(DocCaretState.symbol, DocCaretState, Scope.Singleton);
  }

  public render(): Node<NodeProperties>[] | null {
    const layout = this.#runtime?.document.core.getDocRenderLayoutState();
    if (!layout) return null;
    const runtime = this.#requireRuntime();
    const cursor = runtime.document.cursor.getCursor();
    if (!cursor) return null;
    const scroll = runtime.scroll.manager.getState();
    const composition = runtime.extensions.get(DocViewRuntimeCapability.Composition) ?? null;
    const rect = createVisibleWorldRect(layout);
    return [
      new RichTextCompositionNode({
        nodeKey: `${this.key.key}:composition`,
        rect,
        text: composition?.getText() ?? '',
        anchor: { x: cursor.x, y: cursor.y, height: cursor.height || 10 },
        scroll,
        viewportOverlay: true,
        depth: 10_019,
      }),
      new RichTextCaretNode({
        nodeKey: `${this.key.key}:caret`,
        rect,
        caret: {
          x: cursor.x,
          y: cursor.y,
          height: cursor.height || 10,
          visible: cursor.visible,
          pixelOffset: composition?.getCaretPixelOffset() ?? 0,
        },
        scroll,
        viewportOverlay: true,
        depth: 10_020,
      }),
    ];
  }

  public configure(context: DocViewSetupContext): void {
    this.#runtime = context.runtime;
    context.runtime.extensions.register(DocViewRuntimeCapability.CaretState, this.#caretState);
  }

  public registerKeyboardHandlers({ bindings, commands }: DocKeyboardHandlerRegistrationContext): void {
    bindings.registerKeyboardHandlers({
      onArrowLeft: (shiftKey) =>
        void commands.run(MoveDocCursorCommand, { direction: DocCursorDirection.Left, shiftKey }),
      onArrowRight: (shiftKey) =>
        void commands.run(MoveDocCursorCommand, { direction: DocCursorDirection.Right, shiftKey }),
      onArrowUp: (shiftKey) => void commands.run(MoveDocCursorCommand, { direction: DocCursorDirection.Up, shiftKey }),
      onArrowDown: (shiftKey) =>
        void commands.run(MoveDocCursorCommand, { direction: DocCursorDirection.Down, shiftKey }),
    });
  }

  public destroyView(): void {
    this.assertRuntimeWriteAllowed();
    this.#runtime = null;
  }

  #requireRuntime(): DocViewRuntime {
    if (!this.#runtime) throw new SearError('DocCaretView is not configured.');
    return this.#runtime;
  }
}

function createVisibleWorldRect(layout: DocRenderLayoutState) {
  const scroll = layout.scroll;
  return {
    x: scroll.x,
    y: scroll.y,
    width: layout.viewport.width,
    height: layout.viewport.height,
  };
}
