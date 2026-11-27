import { SearError } from '@searsuite/sear-foundation-error';
import { DocInputPlugin } from '../input/DocInputPlugin';
import { DocCommandBus } from '@searsuite/sear-assembly-commands';
import {
  SessionStateRestorePhase,
  defineSessionState,
  type SessionStateRegistry,
} from '@searsuite/sear-assembly-plugin';
import { type DocSelection } from '@searsuite/sear-domain-doc';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { defineStateObservation, type ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { SelectAllDocCommand, SetDocSelectionCommand, type SetDocSelectionInput } from '../commands/DocEditingCommands';
import { DocPlugin, type DocPluginRuntime, type DocPluginSetupContext } from '../plugin/DocPluginContracts';
import { createDocCommand } from '../plugin/DocPluginCommandUtils';
import { DocSelectionPluginKey } from '../plugin/DocStatePluginKeys';

/** Stable identity for local document selection retained during remounts. */
export const DocSelectionSessionStateDefinition = defineSessionState<DocSelection>('doc.selection');

/** Current document selection exposed as an editor-local typed observation. */
export const DocSelectionObservation = defineStateObservation<DocSelection>('doc.selection');

/** Owns document selection commands, select-all shortcut, and pointer drag selection. */
@Injectable()
export class SelectionPlugin extends DocPlugin<null> {
  readonly #input: DocInputPlugin;

  /** DI token for resolving SelectionPlugin. */
  public static readonly symbol = Symbol.for('SelectionPlugin');

  #runtime: DocPluginRuntime | null = null;

  public constructor(
    @Inject(DocInputPlugin.symbol)
    input: DocInputPlugin,
  ) {
    super({ key: DocSelectionPluginKey, state: null });
    this.#input = input;
  }

  /** Registers the host-facing selection observation. */
  public registerObservations(observations: ObservationRegistry): void {
    observations.register(DocSelectionObservation, {
      getSnapshot: () => cloneSelection(this.#input.session.docSelection),
      subscribe: (listener) =>
        this.#input.subscribeSelection(() => listener(cloneSelection(this.#input.session.docSelection))),
    });
  }

  /** Registers selection-owned local remount state. */
  public registerSessionState(registry: SessionStateRegistry): void {
    registry.register(DocSelectionSessionStateDefinition, {
      restorePhase: SessionStateRestorePhase.BeforeInitialize,
      capture: () => cloneSelection(this.#input.session.docSelection),
      restore: (selection) => this.#input.restoreSelection(selection),
    });
  }

  public registerState() {
    return { key: this.key, state: null };
  }

  public apply(_state: null, _transaction: unknown): null {
    return null;
  }

  public registerCommands(commands: DocCommandBus): void {
    commands.register(SelectAllDocCommand, this.#createSelectAllDocCommand.bind(this));
    commands.register(SetDocSelectionCommand, this.#createSetDocSelectionCommand.bind(this));
  }

  #createSelectAllDocCommand() {
    const plugin = this;
    function createSelectAllDocTransaction() {
      return plugin.#requireRuntime().document.input.createSelectAllTransaction();
    }
    return createDocCommand(SelectAllDocCommand.id, createSelectAllDocTransaction, [{ type: 'reset-caret-blink' }]);
  }

  #createSetDocSelectionCommand(input: SetDocSelectionInput) {
    const plugin = this;
    function createSetDocSelectionTransaction() {
      return plugin.#requireRuntime().document.input.createTransaction(function applySetDocSelectionTransaction(tr) {
        return tr.setSelection(input.selection);
      });
    }
    return createDocCommand(SetDocSelectionCommand.id, createSetDocSelectionTransaction, [
      { type: 'reset-caret-blink' },
    ]);
  }

  public configure(context: DocPluginSetupContext): void {
    this.#runtime = context.runtime;
  }
  public onEditorDestroy(): void {
    this.assertRuntimeWriteAllowed();
    this.#runtime = null;
  }
  #requireRuntime(): DocPluginRuntime {
    if (!this.#runtime) throw new SearError('SelectionPlugin is not configured.');
    return this.#runtime;
  }
}

function cloneSelection(selection: DocSelection): DocSelection {
  return {
    anchor: { path: [...selection.anchor.path], offset: selection.anchor.offset },
    head: { path: [...selection.head.path], offset: selection.head.offset },
  };
}
