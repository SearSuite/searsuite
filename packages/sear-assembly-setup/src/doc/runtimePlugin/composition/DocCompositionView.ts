import { SearError } from '@searsuite/sear-foundation-error';
import { TextInputKind, type TextInputEvent } from '@searsuite/sear-domain-commands';
import { DocCompositionManager } from '@searsuite/sear-assembly-core';
import { type DocCommandBus, type DocCommandContext, type DocCommandResult, type DocEditorCommand } from '@searsuite/sear-assembly-commands';
import { Pipeline } from '@searsuite/sear-assembly-plugin';
import { Injectable } from '@searsuite/sear-foundation-di';

import { ClearDocCompositionCommand, SetDocCompositionCommand, type SetDocCompositionInput } from '@searsuite/sear-assembly-doc';
import { DocView, type DocViewRuntime, type DocViewSetupContext } from '../../DocViewContracts';
import { DocViewRuntimeCapability } from '../../DocViewCapabilities';
import { DocCaretViewKey, DocCompositionViewKey } from '../../DocViewKeys';

/** Owns optional IME composition text state and render invalidation. */
@Injectable()
export class DocCompositionView extends DocView {
  /** DI token for resolving DocCompositionView. */
  public static readonly symbol = Symbol.for('DocCompositionView');

  #runtime: DocViewRuntime | null = null;
  #composition: DocCompositionManager | null = null;
  #disposeTextHandlers: (() => void) | null = null;

  /** Creates a DocCompositionView instance. */
  public constructor() {
    super(DocCompositionViewKey);
  }

  public configure(context: DocViewSetupContext): void {
    this.#runtime = context.runtime;
    this.#composition = context.runtime.extensions.get(DocViewRuntimeCapability.Composition) ?? null;
    const bindings = context.runtime.extensions.get(DocViewRuntimeCapability.InputBindings);
    if (!bindings) return;
    this.#disposeTextHandlers = bindings.registerTextHandlers({
      onTextInput: this.#handleTextInput.bind(this),
    });
  }

  public destroyView(): void {
    this.assertRuntimeWriteAllowed();
    this.#disposeTextHandlers?.();
    this.#disposeTextHandlers = null;
    this.#composition = null;
    this.#runtime = null;
  }

  public registerCommands(commands: DocCommandBus): void {
    commands.register(SetDocCompositionCommand, this.#createSetCompositionCommand.bind(this));
    commands.register(ClearDocCompositionCommand, this.#createClearCompositionCommand.bind(this));
  }

  #handleTextInput(event: TextInputEvent): void {
    if (event.kind === TextInputKind.Text) {
      this.#requireRuntime().commands.run(ClearDocCompositionCommand, void 0);
    } else {
      this.#requireRuntime().commands.run(SetDocCompositionCommand, {
        text: event.text,
        caretOffset: event.caretOffset,
      });
    }
  }

  #createSetCompositionCommand(input: SetDocCompositionInput): DocEditorCommand {
    const plugin = this;
    return {
      id: SetDocCompositionCommand.id,
      execute(_context: DocCommandContext): DocCommandResult {
        const pipeline = new Pipeline(SetDocCompositionCommand.id);
        pipeline.addLocalAction(SetDocCompositionCommand.id, function setDocCompositionText(): void {
          plugin.#requireComposition().setText(input.text, input.caretOffset);
        });
        pipeline.invalidate(`${SetDocCompositionCommand.id}:render`, DocCaretViewKey);
        return { pipeline };
      },
    };
  }

  #createClearCompositionCommand(): DocEditorCommand {
    const plugin = this;
    return {
      id: ClearDocCompositionCommand.id,
      execute(_context: DocCommandContext): DocCommandResult {
        const pipeline = new Pipeline(ClearDocCompositionCommand.id);
        pipeline.addLocalAction(ClearDocCompositionCommand.id, function clearDocCompositionText(): void {
          plugin.#requireComposition().clear();
        });
        pipeline.invalidate(`${ClearDocCompositionCommand.id}:render`, DocCaretViewKey);
        return { pipeline };
      },
    };
  }

  #requireRuntime(): DocViewRuntime {
    if (!this.#runtime) throw new SearError('DocCompositionView is not configured.');
    return this.#runtime;
  }

  #requireComposition(): DocCompositionManager {
    if (!this.#composition) throw new SearError('DocCompositionView has no composition manager.');
    return this.#composition;
  }
}
