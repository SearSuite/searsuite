import { SearError } from '@searsuite/sear-foundation-error';
import { DocCommandBus } from '@searsuite/sear-assembly-commands';

import { Injectable } from '@searsuite/sear-foundation-di';
import { FocusDocCommand, MoveDocCursorCommand, type MoveDocCursorInput } from '../commands/DocEditingCommands';
import { DocPlugin, type DocPluginRuntime, type DocPluginSetupContext } from '../plugin/DocPluginContracts';
import { createDocCommand } from '../plugin/DocPluginCommandUtils';
import { DocNavigationPluginKey } from '../plugin/DocStatePluginKeys';

/** Owns semantic document navigation and focus commands. */
@Injectable()
export class DocNavigationPlugin extends DocPlugin<null> {
  /** DI token for resolving DocNavigationPlugin. */
  public static readonly symbol = Symbol.for('DocNavigationPlugin');

  #runtime: DocPluginRuntime | null = null;

  public constructor() {
    super({ key: DocNavigationPluginKey, state: null });
  }
  public configure(context: DocPluginSetupContext): void {
    this.#runtime = context.runtime;
  }
  public onEditorDestroy(): void {
    this.#runtime = null;
  }
  public registerState() {
    return { key: this.key, state: null };
  }

  public apply(_state: null, _transaction: unknown): null {
    return null;
  }

  public registerCommands(commands: DocCommandBus): void {
    commands.register(MoveDocCursorCommand, this.#createMoveDocCursorCommand.bind(this));
    commands.register(FocusDocCommand, createFocusDocCommand);
  }

  #createMoveDocCursorCommand(input: MoveDocCursorInput) {
    const plugin = this;
    function createMoveDocCursorTransaction() {
      return plugin.#requireRuntime().document.input.createArrowTransaction(input.direction, input.shiftKey ?? false);
    }
    return createDocCommand(MoveDocCursorCommand.id, createMoveDocCursorTransaction, [{ type: 'reset-caret-blink' }]);
  }

  #requireRuntime(): DocPluginRuntime {
    if (!this.#runtime) throw new SearError('DocNavigationPlugin is not configured.');
    return this.#runtime;
  }
}

function createFocusDocCommand() {
  return createDocCommand(FocusDocCommand.id, void 0, [{ type: 'focus-document' }]);
}
