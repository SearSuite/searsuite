import { SearError } from '@searsuite/sear-foundation-error';
import { type DocRenderLayoutState } from '@searsuite/sear-assembly-core';
import { DocCommandBus } from '@searsuite/sear-assembly-commands';
import { DocCursorDirection } from '@searsuite/sear-domain-commands';
import { Inject, Injectable, Scope } from '@searsuite/sear-foundation-di';
import {
  RichTextCaretNode,
  RichTextCompositionNode,
  type Node,
  type NodeProperties,
} from '@searsuite/sear-render-node';
import { FocusDocCommand, MoveDocCursorCommand, type MoveDocCursorInput } from '@searsuite/sear-assembly-doc';
import {
  DocPlugin,
  type DocKeyboardHandlerRegistrationContext,
  type DocPluginRuntime,
  type DocPluginServiceContext,
  type DocPluginSetupContext,
} from '@searsuite/sear-assembly-doc';
import { DocCaretState } from '../../DocCaretState';
import { DocPluginRuntimeCapability } from '@searsuite/sear-assembly-doc';
import { createDocCommand } from '@searsuite/sear-assembly-doc';
import { DocCaretPluginKey, DocSelectionPluginKey } from '@searsuite/sear-assembly-doc';

/** Owns caret movement, focus, blink state, and caret overlay rendering. */
@Injectable()
export class CaretPlugin extends DocPlugin<null> {
  /** DI token for resolving CaretPlugin. */
  public static readonly symbol = Symbol.for('CaretPlugin');

  private runtime: DocPluginRuntime | null = null;

  /** Creates a CaretPlugin instance. */
  public constructor(
    @Inject(DocCaretState.symbol)
    private readonly caretState: DocCaretState,
  ) {
    super({ key: DocCaretPluginKey, state: null });
  }

  /** Registers caret-owned state before the plugin is resolved. */
  public static registerServices(context: DocPluginServiceContext): void {
    context.container.register(DocCaretState.symbol, DocCaretState, Scope.Singleton);
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
    const runtime = this.requireRuntime();
    const cursor = runtime.document.cursor.getCursor();
    if (!cursor) return null;
    const scroll = runtime.scroll.manager.getState();
    const composition = runtime.extensions.get(DocPluginRuntimeCapability.Composition) ?? null;
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

  public configure(context: DocPluginSetupContext): void {
    this.runtime = context.runtime;
    context.runtime.extensions.register(DocPluginRuntimeCapability.CaretState, this.caretState);
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

  public onEditorDestroy(): void {
    this.assertRuntimeWriteAllowed();
    this.runtime = null;
  }

  public registerCommands(commands: DocCommandBus): void {
    commands.register(MoveDocCursorCommand, this.createMoveDocCursorCommand.bind(this));
    commands.register(FocusDocCommand, createFocusDocCommand);
  }

  private createMoveDocCursorCommand(input: MoveDocCursorInput) {
    const plugin = this;
    function createMoveDocCursorTransaction() {
      return plugin.requireRuntime().document.input.createArrowTransaction(input.direction, input.shiftKey ?? false);
    }
    return createDocCommand(
      MoveDocCursorCommand.id,
      [DocCaretPluginKey, DocSelectionPluginKey],
      createMoveDocCursorTransaction,
      [{ type: 'reset-caret-blink' }],
    );
  }

  private requireRuntime(): DocPluginRuntime {
    if (!this.runtime) throw new SearError('CaretPlugin is not configured.');
    return this.runtime;
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

function createFocusDocCommand() {
  return createDocCommand(FocusDocCommand.id, DocCaretPluginKey, void 0, [{ type: 'focus-document' }]);
}
