import { SearError } from '@searsuite/sear-foundation-error';
import { type DocRenderLayoutState } from '@searsuite/sear-assembly-core';

import { type DocSelection } from '@searsuite/sear-domain-doc';
import { Injectable } from '@searsuite/sear-foundation-di';

import { RichTextSelectionNode, type Node, type NodeProperties } from '@searsuite/sear-render-node';
import { SelectAllDocCommand, SetDocSelectionCommand } from '@searsuite/sear-assembly-doc';
import { DocView, type DocViewRuntime, type DocViewSetupContext } from '../../DocViewContracts';
import { type DocKeyboardHandlerRegistrationContext } from '../../DocViewContracts';
import { type DocInteractionRuntime, type DocPointerInput } from '../../DocInteractionRuntime';
import { DocViewRuntimeCapability } from '../../DocViewCapabilities';

import { DocSelectionViewKey } from '../../DocViewKeys';

/** Stable identity for local document selection retained during remounts. */

/** Current document selection exposed as an editor-local typed observation. */

/** Owns document selection commands, select-all shortcut, and pointer drag selection. */
@Injectable()
export class DocSelectionView extends DocView {
  /** DI token for resolving DocSelectionView. */
  public static readonly symbol = Symbol.for('DocSelectionView');

  #runtime: DocViewRuntime | null = null;
  #interaction: DocInteractionRuntime | null = null;
  #pointerSelecting = false;
  #disposePointerCapture: (() => void) | null = null;
  #pendingPointerMove: DocPointerInput | null = null;
  #pointerMoveFrame: number | null = null;
  #disposers: (() => void)[] = [];

  public constructor() {
    super(DocSelectionViewKey);
  }
  public render(): Node<NodeProperties>[] | null {
    const layout = this.#runtime?.document.core.getDocRenderLayoutState();
    if (!layout) return null;
    const scroll = this.#runtime?.scroll.manager.getState() ?? { x: 0, y: 0 };
    return [
      new RichTextSelectionNode({
        nodeKey: `${this.key.key}:selection`,
        rect: createVisibleWorldRect(layout),
        rects: this.#runtime?.document.cursor.getSelectionRects() ?? [],
        offset: { x: -scroll.x, y: -scroll.y },
        viewportOverlay: true,
        depth: 10_010,
      }),
    ];
  }

  public configure(context: DocViewSetupContext): void {
    this.#runtime = context.runtime;
    this.#interaction = context.runtime.extensions.get(DocViewRuntimeCapability.Interaction) ?? null;
  }

  public registerKeyboardHandlers({ bindings, commands }: DocKeyboardHandlerRegistrationContext): void {
    bindings.registerKeyboardHandlers({
      onSelectAll: () => void commands.run(SelectAllDocCommand, void 0),
    });
  }

  public start(): void {
    if (!this.#interaction) return;
    this.#disposers.push(
      this.#interaction.subscribePointerDrag({
        onStart: this.#handlePointerStart.bind(this),
        onMove: this.#handlePointerMove.bind(this),
        onEnd: this.#handlePointerEnd.bind(this),
      }),
    );
  }

  public destroyView(): void {
    this.assertRuntimeWriteAllowed();
    this.#pointerSelecting = false;
    this.#cancelScheduledPointerMove();
    this.#disposePointerCapture?.();
    this.#disposePointerCapture = null;
    for (const dispose of this.#disposers.splice(0).reverse()) dispose();
    this.#runtime = null;
    this.#interaction = null;
  }

  #handlePointerStart(pointer: DocPointerInput): void {
    const runtime = this.#requireRuntime();
    const interaction = this.#requireInteraction();
    pointer.preventDefault();
    const cursor = interaction.resolveCursorFromPointer(pointer);
    runtime.commands.run(SetDocSelectionCommand, { selection: { anchor: cursor, head: cursor } });
    this.#pointerSelecting = true;
    this.#disposePointerCapture?.();
    this.#disposePointerCapture = runtime.input.pointer.start({ onRelease: this.#stopPointerSelecting.bind(this) });
    runtime.input.text.refocus();
  }

  #handlePointerMove(pointer: DocPointerInput): void {
    if (!this.#pointerSelecting) return;
    pointer.preventDefault();
    this.#pendingPointerMove = createDeferredPointerInput(pointer);
    if (this.#pointerMoveFrame !== null) return;
    this.#pointerMoveFrame = this.#requireRuntime().platform.requestAnimationFrame(
      this.#runScheduledPointerMove.bind(this),
    );
  }

  #runScheduledPointerMove(): void {
    this.#pointerMoveFrame = null;
    this.#applyPendingPointerMove();
  }

  #applyPendingPointerMove(): void {
    const pointer = this.#pendingPointerMove;
    this.#pendingPointerMove = null;
    if (!this.#pointerSelecting || !pointer) return;
    const runtime = this.#requireRuntime();
    const interaction = this.#requireInteraction();
    const cursor = interaction.resolveCursorFromPointer(pointer);
    runtime.commands.run(SetDocSelectionCommand, {
      selection: {
        anchor: runtime.document.input.session.docSelection.anchor,
        head: cursor,
      },
    });
  }

  #handlePointerEnd(): void {
    this.#flushScheduledPointerMove();
    this.#pointerSelecting = false;
    this.#disposePointerCapture?.();
    this.#disposePointerCapture = null;
  }

  #stopPointerSelecting(): void {
    this.#cancelScheduledPointerMove();
    this.#pointerSelecting = false;
    this.#disposePointerCapture = null;
  }

  #requireRuntime(): DocViewRuntime {
    if (!this.#runtime) throw new SearError('DocSelectionView is not configured.');
    return this.#runtime;
  }

  #requireInteraction(): DocInteractionRuntime {
    if (!this.#interaction) throw new SearError('DocSelectionView has no interaction runtime.');
    return this.#interaction;
  }

  #flushScheduledPointerMove(): void {
    if (this.#pointerMoveFrame !== null) {
      this.#requireRuntime().platform.cancelAnimationFrame(this.#pointerMoveFrame);
      this.#pointerMoveFrame = null;
    }
    this.#applyPendingPointerMove();
  }

  #cancelScheduledPointerMove(): void {
    if (this.#pointerMoveFrame !== null && this.#runtime) {
      this.#runtime.platform.cancelAnimationFrame(this.#pointerMoveFrame);
    }
    this.#pointerMoveFrame = null;
    this.#pendingPointerMove = null;
  }
}

function createVisibleWorldRect(layout: DocRenderLayoutState) {
  return {
    x: layout.scroll.x,
    y: layout.scroll.y,
    width: layout.viewport.width,
    height: layout.viewport.height,
  };
}

function createDeferredPointerInput(pointer: DocPointerInput): DocPointerInput {
  return {
    viewX: pointer.viewX,
    viewY: pointer.viewY,
    preventDefault: noopPreventDefault,
  };
}

function noopPreventDefault(): void {}

function cloneSelection(selection: DocSelection): DocSelection {
  return {
    anchor: { path: [...selection.anchor.path], offset: selection.anchor.offset },
    head: { path: [...selection.head.path], offset: selection.head.offset },
  };
}
