import { SearError } from '@searsuite/sear-foundation-error';
import { DocCommandBus } from '@searsuite/sear-assembly-commands';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { DocNodeRegistry, registerTextDocNode } from '@searsuite/sear-domain-doc';
import { Injectable } from '@searsuite/sear-foundation-di';

import {
  DeleteDocBackwardCommand,
  InsertDocTextCommand,
  type InsertDocTextInput,
} from '../commands/DocEditingCommands';
import {
  DocPlugin,
  type DocPluginRuntime,
  type DocPluginServiceContext,
  type DocPluginSetupContext,
} from '../plugin/DocPluginContracts';
import { createDocCommand } from '../plugin/DocPluginCommandUtils';

/** Owns printable text input and delete bindings. */
@Injectable()
export class TextInputPlugin extends DocPlugin<null> {
  /** DI token for resolving TextInputPlugin. */
  public static readonly symbol = Symbol.for('TextInputPlugin');

  #runtime: DocPluginRuntime | null = null;

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

  public configure(context: DocPluginSetupContext): void {
    this.#runtime = context.runtime;
  }
  public onEditorDestroy(): void {
    this.#runtime = null;
  }
  public registerCommands(commands: DocCommandBus): void {
    commands.register(InsertDocTextCommand, this.#createInsertTextCommand.bind(this));
    commands.register(DeleteDocBackwardCommand, this.#createDeleteBackwardCommand.bind(this));
  }

  #createInsertTextCommand(input: InsertDocTextInput) {
    const plugin = this;
    function createInsertDocTextTransaction() {
      return input.text === '\n'
        ? plugin.#requireRuntime().document.input.createSoftEnterTransaction()
        : plugin.#requireRuntime().document.input.createInputTransaction(input.text);
    }
    return createDocCommand(InsertDocTextCommand.id, createInsertDocTextTransaction, [{ type: 'reset-caret-blink' }]);
  }

  #createDeleteBackwardCommand() {
    return createDocCommand(DeleteDocBackwardCommand.id, this.#createDeleteBackwardTransaction.bind(this), [
      { type: 'reset-caret-blink' },
    ]);
  }

  #createDeleteBackwardTransaction() {
    return this.#requireRuntime().document.input.createDeleteTransaction();
  }

  #requireRuntime(): DocPluginRuntime {
    if (!this.#runtime) throw new SearError('TextInputPlugin is not configured.');
    return this.#runtime;
  }
}
