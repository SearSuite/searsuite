import { SearError } from '@searsuite/sear-foundation-error';
import { TextInputKind, type TextInputEvent } from '@searsuite/sear-domain-commands';

import { PluginKey } from '@searsuite/sear-assembly-plugin';

import { Injectable } from '@searsuite/sear-foundation-di';

import { DeleteDocBackwardCommand, InsertDocTextCommand } from '@searsuite/sear-assembly-doc';
import { DocView, type DocViewRuntime, type DocViewSetupContext } from '../../DocViewContracts';
import { type DocKeyboardHandlerRegistrationContext } from '../../DocViewContracts';
import { DocViewRuntimeCapability } from '../../DocViewCapabilities';

/** Owns printable text input and delete bindings. */
@Injectable()
export class DocTextInputView extends DocView {
  /** DI token for resolving DocTextInputView. */
  public static readonly symbol = Symbol.for('DocTextInputView');

  #runtime: DocViewRuntime | null = null;
  #disposeTextHandlers: (() => void) | null = null;

  /** Creates a DocTextInputView instance. */
  public constructor() {
    super(new PluginKey('DocTextInput'));
  }

  public configure(context: DocViewSetupContext): void {
    this.#runtime = context.runtime;
    const bindings = context.runtime.extensions.get(DocViewRuntimeCapability.InputBindings);
    if (!bindings) return;
    this.#disposeTextHandlers = bindings.registerTextHandlers({
      onTextInput: this.#handleTextInput.bind(this),
      onDelete: this.#handleTextDelete.bind(this),
    });
  }

  public registerKeyboardHandlers({ bindings, commands }: DocKeyboardHandlerRegistrationContext): void {
    bindings.registerKeyboardHandlers({
      onDelete: () => void commands.run(DeleteDocBackwardCommand, void 0),
    });
  }

  public destroyView(): void {
    this.assertRuntimeWriteAllowed();
    this.#disposeTextHandlers?.();
    this.#disposeTextHandlers = null;
    this.#runtime = null;
  }

  #handleTextInput(event: TextInputEvent): void {
    if (event.kind !== TextInputKind.Text) return;
    void this.#requireRuntime().commands.run(InsertDocTextCommand, { text: event.text });
  }

  #handleTextDelete(): void {
    void this.#requireRuntime().commands.run(DeleteDocBackwardCommand, void 0);
  }

  #requireRuntime(): DocViewRuntime {
    if (!this.#runtime) throw new SearError('DocTextInputView is not configured.');
    return this.#runtime;
  }
}
