import { DocCommandEffectRegistry } from '@searsuite/sear-assembly-commands';
import { DocRuntimeExtensionRegistry } from '@searsuite/sear-assembly-doc';
import { TextInput } from '@searsuite/sear-render-input';
import { DocViewRuntimeCapability } from './DocViewCapabilities';

/** Attaches optional host effect consumers without replacing the business command executor. */
export function bindDocEditorCommandHost(input: {
  readonly effects: DocCommandEffectRegistry;
  readonly textInput: TextInput;
  readonly extensions: DocRuntimeExtensionRegistry;
}): () => void {
  const disposeFocus = input.effects.register('focus-document', () => input.textInput.refocus());
  const disposeCaret = input.effects.register('reset-caret-blink', () =>
    input.extensions.get(DocViewRuntimeCapability.CaretState)?.reset(),
  );
  return () => {
    disposeCaret();
    disposeFocus();
  };
}
