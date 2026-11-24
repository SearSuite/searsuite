import { SearError } from '@searsuite/sear-foundation-error';
import { TextInputKind, type TextInputEvent } from '@searsuite/sear-render-input';
import { DocCompositionManager } from '@searsuite/sear-assembly-core';
import {
  type DocCommandBus,
  type DocCommandContext,
  type DocCommandResult,
  type DocEditorCommand,
} from '@searsuite/sear-assembly-commands';
import { Pipeline } from '@searsuite/sear-assembly-core';
import { Injectable } from '@searsuite/sear-foundation-di';
import { type Node, type NodeProperties } from '@searsuite/sear-render-node';
import {
  ClearDocCompositionCommand,
  SetDocCompositionCommand,
  type SetDocCompositionInput,
} from '@searsuite/sear-assembly-doc';
import { DocPlugin, type DocPluginRuntime, type DocPluginSetupContext } from '@searsuite/sear-assembly-doc';
import { DocPluginRuntimeCapability } from '@searsuite/sear-assembly-doc';
import { DocCaretPluginKey, DocCompositionPluginKey } from '@searsuite/sear-assembly-doc';

/** Owns optional IME composition text state and render invalidation. */
@Injectable()
export class CompositionPlugin extends DocPlugin<null> {
  /** DI token for resolving CompositionPlugin. */
  public static readonly symbol = Symbol.for('CompositionPlugin');

  #runtime: DocPluginRuntime | null = null;
  #composition: DocCompositionManager | null = null;
  #disposeTextHandlers: (() => void) | null = null;

  /** Creates a CompositionPlugin instance. */
  public constructor() {
    super({ key: DocCompositionPluginKey, state: null });
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
    this.#runtime = context.runtime;
    this.#composition = context.runtime.extensions.get(DocPluginRuntimeCapability.Composition) ?? null;
    const bindings = context.runtime.extensions.get(DocPluginRuntimeCapability.InputBindings);
    if (!bindings) return;
    this.#disposeTextHandlers = bindings.registerTextHandlers({
      onTextInput: this.#handleTextInput.bind(this),
    });
  }

  public onEditorDestroy(): void {
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
        pipeline.addRender(`${SetDocCompositionCommand.id}:render`, DocCaretPluginKey);
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
        pipeline.addRender(`${ClearDocCompositionCommand.id}:render`, DocCaretPluginKey);
        return { pipeline };
      },
    };
  }

  #requireRuntime(): DocPluginRuntime {
    if (!this.#runtime) throw new SearError('CompositionPlugin is not configured.');
    return this.#runtime;
  }

  #requireComposition(): DocCompositionManager {
    if (!this.#composition) throw new SearError('CompositionPlugin has no composition manager.');
    return this.#composition;
  }
}
