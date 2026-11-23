import { SearError } from '@searsuite/sear-foundation-error';
import { TextInputKind, type TextInputEvent } from '@searsuite/sear-render-input';
import { DocCommandBus } from '@searsuite/sear-assembly-commands';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { DocNodeRegistry, registerTextDocNode } from '@searsuite/sear-domain-doc';
import { Injectable } from '@searsuite/sear-foundation-di';
import { type Node, type NodeProperties } from '@searsuite/sear-render-node';
import { DeleteDocBackwardCommand, InsertDocTextCommand, type InsertDocTextInput } from '@searsuite/sear-assembly-doc';
import {
  DocPlugin,
  type DocKeyboardHandlerRegistrationContext,
  type DocPluginRuntime,
  type DocPluginServiceContext,
  type DocPluginSetupContext,
} from '@searsuite/sear-assembly-doc';
import { DocPluginRuntimeCapability } from '@searsuite/sear-assembly-doc';
import { createDocCommand } from '@searsuite/sear-assembly-doc';
import { DocContentRenderPluginKey } from '@searsuite/sear-assembly-doc';

/** Owns printable text input and delete bindings. */
@Injectable()
export class TextInputPlugin extends DocPlugin<null> {
  /** DI token for resolving TextInputPlugin. */
  public static readonly symbol = Symbol.for('TextInputPlugin');

  private runtime: DocPluginRuntime | null = null;
  private disposeTextHandlers: (() => void) | null = null;

  /** Creates a TextInputPlugin instance. */
  public constructor() {
    super({ key: new PluginKey('DocTextInput'), state: null });
  }

  /** Registers text node model support owned by this plugin. */
  public static registerServices(context: DocPluginServiceContext): void {
    registerTextDocNode(context.container.resolve<DocNodeRegistry>(DocNodeRegistry.symbol));
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
    return null;
  }

  public configure(context: DocPluginSetupContext): void {
    this.runtime = context.runtime;
    const bindings = context.runtime.extensions.get(DocPluginRuntimeCapability.InputBindings);
    if (!bindings) return;
    this.disposeTextHandlers = bindings.registerTextHandlers({
      onTextInput: this.handleTextInput.bind(this),
      onDelete: this.handleTextDelete.bind(this),
    });
  }

  public registerKeyboardHandlers({ bindings, commands }: DocKeyboardHandlerRegistrationContext): void {
    bindings.registerKeyboardHandlers({
      onDelete: () => void commands.run(DeleteDocBackwardCommand, void 0),
    });
  }

  public onEditorDestroy(): void {
    this.assertRuntimeWriteAllowed();
    this.disposeTextHandlers?.();
    this.disposeTextHandlers = null;
    this.runtime = null;
  }

  public registerCommands(commands: DocCommandBus): void {
    commands.register(InsertDocTextCommand, this.createInsertTextCommand.bind(this));
    commands.register(DeleteDocBackwardCommand, this.createDeleteBackwardCommand.bind(this));
  }

  private handleTextInput(event: TextInputEvent): void {
    if (event.kind !== TextInputKind.Text) return;
    void this.requireRuntime().commands.run(InsertDocTextCommand, { text: event.text });
  }

  private handleTextDelete(): void {
    void this.requireRuntime().commands.run(DeleteDocBackwardCommand, void 0);
  }

  private createInsertTextCommand(input: InsertDocTextInput) {
    const plugin = this;
    function createInsertDocTextTransaction() {
      return input.text === '\n'
        ? plugin.requireRuntime().document.input.createSoftEnterTransaction()
        : plugin.requireRuntime().document.input.createInputTransaction(input.text);
    }
    return createDocCommand(InsertDocTextCommand.id, DocContentRenderPluginKey, createInsertDocTextTransaction, [
      { type: 'reset-caret-blink' },
    ]);
  }

  private createDeleteBackwardCommand() {
    return createDocCommand(
      DeleteDocBackwardCommand.id,
      DocContentRenderPluginKey,
      this.createDeleteBackwardTransaction.bind(this),
      [{ type: 'reset-caret-blink' }],
    );
  }

  private createDeleteBackwardTransaction() {
    return this.requireRuntime().document.input.createDeleteTransaction();
  }

  private requireRuntime(): DocPluginRuntime {
    if (!this.runtime) throw new SearError('TextInputPlugin is not configured.');
    return this.runtime;
  }
}
