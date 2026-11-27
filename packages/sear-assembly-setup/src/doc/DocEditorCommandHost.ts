import { DocCommandBus } from '@searsuite/sear-assembly-commands';
import { SearCoreDoc } from '@searsuite/sear-assembly-core';
import { TextInput } from '@searsuite/sear-render-input';

import { DocViewRuntimeCapability } from './DocViewCapabilities';
import { DocRuntimeExtensionRegistry } from '@searsuite/sear-assembly-doc';

/** Binds the command bus to document Core mutations and host adapter effects. */
export function bindDocEditorCommandHost(input: {
  readonly commands: DocCommandBus;
  readonly searCoreDoc: SearCoreDoc;
  readonly textInput: TextInput;
  readonly extensions: DocRuntimeExtensionRegistry;
}): void {
  input.commands.bind({
    executePipeline(pipeline): void {
      input.searCoreDoc.executePipeline(pipeline);
    },
    applyEffect(effect): void {
      if (effect.type === 'focus-document') input.textInput.refocus();
      if (effect.type === 'reset-caret-blink') input.extensions.get(DocViewRuntimeCapability.CaretState)?.reset();
    },
  });
}
