import { SearError } from '@searsuite/sear-foundation-error';
import { DocInputPlugin, type DocRenderLayoutState } from '@searsuite/sear-assembly-core';
import { DocCommandBus } from '@searsuite/sear-assembly-commands';
import {
  SessionStateRestorePhase,
  defineSessionState,
  type SessionStateRegistry,
} from '@searsuite/sear-assembly-plugin';
import { type DocSelection } from '@searsuite/sear-domain-doc';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { defineStateObservation, type ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { RichTextSelectionNode, type Node, type NodeProperties } from '@searsuite/sear-render-node';
import { SelectAllDocCommand, SetDocSelectionCommand, type SetDocSelectionInput } from '@searsuite/sear-assembly-doc';
import {
  DocPlugin,
  type DocKeyboardHandlerRegistrationContext,
  type DocPluginRuntime,
  type DocPluginSetupContext,
} from '@searsuite/sear-assembly-doc';
import { type DocInteractionRuntime, type DocPointerInput } from '../../DocInteractionRuntime';
import { DocPluginRuntimeCapability } from '@searsuite/sear-assembly-doc';
import { createDocCommand } from '@searsuite/sear-assembly-doc';
import { DocCaretPluginKey, DocSelectionPluginKey } from '@searsuite/sear-assembly-doc';

/** Stable identity for local document selection retained during remounts. */
export const DocSelectionSessionStateDefinition = defineSessionState<DocSelection>('doc.selection');

/** Current document selection exposed as an editor-local typed observation. */
export const DocSelectionObservation = defineStateObservation<DocSelection>('doc.selection');

/** Owns document selection commands, select-all shortcut, and pointer drag selection. */
@Injectable()
export class SelectionPlugin extends DocPlugin<null> {
  /** DI token for resolving SelectionPlugin. */
  public static readonly symbol = Symbol.for('SelectionPlugin');

  private runtime: DocPluginRuntime | null = null;
  private interaction: DocInteractionRuntime | null = null;
  private pointerSelecting = false;
  private disposePointerCapture: (() => void) | null = null;
  private pendingPointerMove: DocPointerInput | null = null;
  private pointerMoveFrame: number | null = null;
  private disposers: (() => void)[] = [];

  public constructor(
    @Inject(DocInputPlugin.symbol)
    private readonly input: DocInputPlugin,
  ) {
    super({ key: DocSelectionPluginKey, state: null });
  }

  /** Registers the host-facing selection observation. */
  public registerObservations(observations: ObservationRegistry): void {
    observations.register(DocSelectionObservation, {
      getSnapshot: () => cloneSelection(this.input.session.docSelection),
      subscribe: (listener) =>
        this.input.subscribeSelection(() => listener(cloneSelection(this.input.session.docSelection))),
    });
  }

  /** Registers selection-owned local remount state. */
  public registerSessionState(registry: SessionStateRegistry): void {
    registry.register(DocSelectionSessionStateDefinition, {
      restorePhase: SessionStateRestorePhase.BeforeInitialize,
      capture: () => cloneSelection(this.input.session.docSelection),
      restore: (selection) => this.input.restoreSelection(selection),
    });
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

  public render(): Node<NodeProperties>[] | null {
    const layout = this.runtime?.document.core.getDocRenderLayoutState();
    if (!layout) return null;
    const scroll = this.runtime?.scroll.manager.getState() ?? { x: 0, y: 0 };
    return [
      new RichTextSelectionNode({
        nodeKey: `${this.key.key}:selection`,
        rect: createVisibleWorldRect(layout),
        rects: this.runtime?.document.cursor.getSelectionRects() ?? [],
        offset: { x: -scroll.x, y: -scroll.y },
        viewportOverlay: true,
        depth: 10_010,
      }),
    ];
  }

  public configure(context: DocPluginSetupContext): void {
    this.runtime = context.runtime;
    this.interaction = context.runtime.extensions.get(DocPluginRuntimeCapability.Interaction) ?? null;
  }

  public registerKeyboardHandlers({ bindings, commands }: DocKeyboardHandlerRegistrationContext): void {
    bindings.registerKeyboardHandlers({
      onSelectAll: () => void commands.run(SelectAllDocCommand, void 0),
    });
  }

  public start(): void {
    if (!this.interaction) return;
    this.disposers.push(
      this.interaction.subscribePointerDrag({
        onStart: this.handlePointerStart.bind(this),
        onMove: this.handlePointerMove.bind(this),
        onEnd: this.handlePointerEnd.bind(this),
      }),
    );
  }

  public onEditorDestroy(): void {
    this.assertRuntimeWriteAllowed();
    this.pointerSelecting = false;
    this.cancelScheduledPointerMove();
    this.disposePointerCapture?.();
    this.disposePointerCapture = null;
    for (const dispose of this.disposers.splice(0).reverse()) dispose();
    this.runtime = null;
    this.interaction = null;
  }

  public registerCommands(commands: DocCommandBus): void {
    commands.register(SelectAllDocCommand, this.createSelectAllDocCommand.bind(this));
    commands.register(SetDocSelectionCommand, this.createSetDocSelectionCommand.bind(this));
  }

  private createSelectAllDocCommand() {
    const plugin = this;
    function createSelectAllDocTransaction() {
      return plugin.requireRuntime().document.input.createSelectAllTransaction();
    }
    return createDocCommand(
      SelectAllDocCommand.id,
      [DocSelectionPluginKey, DocCaretPluginKey],
      createSelectAllDocTransaction,
      [{ type: 'reset-caret-blink' }],
    );
  }

  private createSetDocSelectionCommand(input: SetDocSelectionInput) {
    const plugin = this;
    function createSetDocSelectionTransaction() {
      return plugin.requireRuntime().document.input.createTransaction(function applySetDocSelectionTransaction(tr) {
        return tr.setSelection(input.selection);
      });
    }
    return createDocCommand(
      SetDocSelectionCommand.id,
      [DocSelectionPluginKey, DocCaretPluginKey],
      createSetDocSelectionTransaction,
      [{ type: 'reset-caret-blink' }],
    );
  }

  private handlePointerStart(pointer: DocPointerInput): void {
    const runtime = this.requireRuntime();
    const interaction = this.requireInteraction();
    pointer.preventDefault();
    const cursor = interaction.resolveCursorFromPointer(pointer);
    runtime.commands.run(SetDocSelectionCommand, { selection: { anchor: cursor, head: cursor } });
    this.pointerSelecting = true;
    this.disposePointerCapture?.();
    this.disposePointerCapture = runtime.input.pointer.start({ onRelease: this.stopPointerSelecting.bind(this) });
    runtime.input.text.refocus();
  }

  private handlePointerMove(pointer: DocPointerInput): void {
    if (!this.pointerSelecting) return;
    pointer.preventDefault();
    this.pendingPointerMove = createDeferredPointerInput(pointer);
    if (this.pointerMoveFrame !== null) return;
    this.pointerMoveFrame = this.requireRuntime().platform.requestAnimationFrame(
      this.runScheduledPointerMove.bind(this),
    );
  }

  private runScheduledPointerMove(): void {
    this.pointerMoveFrame = null;
    this.applyPendingPointerMove();
  }

  private applyPendingPointerMove(): void {
    const pointer = this.pendingPointerMove;
    this.pendingPointerMove = null;
    if (!this.pointerSelecting || !pointer) return;
    const runtime = this.requireRuntime();
    const interaction = this.requireInteraction();
    const cursor = interaction.resolveCursorFromPointer(pointer);
    runtime.commands.run(SetDocSelectionCommand, {
      selection: {
        anchor: runtime.document.input.session.docSelection.anchor,
        head: cursor,
      },
    });
  }

  private handlePointerEnd(): void {
    this.flushScheduledPointerMove();
    this.pointerSelecting = false;
    this.disposePointerCapture?.();
    this.disposePointerCapture = null;
  }

  private stopPointerSelecting(): void {
    this.cancelScheduledPointerMove();
    this.pointerSelecting = false;
    this.disposePointerCapture = null;
  }

  private requireRuntime(): DocPluginRuntime {
    if (!this.runtime) throw new SearError('SelectionPlugin is not configured.');
    return this.runtime;
  }

  private requireInteraction(): DocInteractionRuntime {
    if (!this.interaction) throw new SearError('SelectionPlugin has no interaction runtime.');
    return this.interaction;
  }

  private flushScheduledPointerMove(): void {
    if (this.pointerMoveFrame !== null) {
      this.requireRuntime().platform.cancelAnimationFrame(this.pointerMoveFrame);
      this.pointerMoveFrame = null;
    }
    this.applyPendingPointerMove();
  }

  private cancelScheduledPointerMove(): void {
    if (this.pointerMoveFrame !== null && this.runtime) {
      this.runtime.platform.cancelAnimationFrame(this.pointerMoveFrame);
    }
    this.pointerMoveFrame = null;
    this.pendingPointerMove = null;
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
