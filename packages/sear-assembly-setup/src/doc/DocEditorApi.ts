import { SearError } from '@searsuite/sear-foundation-error';
import { DocCommandBus } from '@searsuite/sear-assembly-commands';
import { RichDocNode } from '@searsuite/sear-domain-doc';
import { type ObservationRegistry } from '@searsuite/sear-foundation-subscription';

import { FocusDocCommand, LoadDocumentCommand, RenderDocCommand } from '@searsuite/sear-assembly-doc';
import { DocDocumentSessionCoordinator } from './DocDocumentSessionCoordinator';
import { type DocEditor } from './createDocEditor';
import { type DocRuntimeCapabilityReader } from '@searsuite/sear-assembly-doc';

/** Creates the public DocEditor facade over commands and runtime coordinators. */
export function createDocEditorApi(input: {
  readonly commands: DocCommandBus;
  readonly observations: ObservationRegistry;
  readonly services: DocRuntimeCapabilityReader;
  readonly session: DocDocumentSessionCoordinator;
  readonly dispose: () => void;
  readonly isDestroyed: () => boolean;
  readonly markDestroyed: () => void;
}): DocEditor {
  return {
    commands: input.commands,
    observations: input.observations,
    services: input.services,
    loadDocument(document): void {
      if (input.commands.has(LoadDocumentCommand)) input.commands.run(LoadDocumentCommand, { document });
      else throw new SearError(`DocEditor cannot load a document because ${LoadDocumentCommand.id} is not registered.`);
    },
    getDocument(): RichDocNode[] {
      return input.session.getDocument();
    },
    getText(): string {
      return input.session.getText();
    },
    focus(): void {
      if (input.commands.has(FocusDocCommand)) input.commands.run(FocusDocCommand, void 0);
      else throw new SearError(`DocEditor cannot focus because ${FocusDocCommand.id} is not registered.`);
    },
    render(): void {
      if (input.isDestroyed()) return;
      if (input.commands.has(RenderDocCommand)) input.commands.run(RenderDocCommand, void 0);
      else throw new SearError(`DocEditor cannot render because ${RenderDocCommand.id} is not registered.`);
    },
    destroy(): void {
      if (input.isDestroyed()) return;
      input.markDestroyed();
      input.dispose();
    },
  };
}
