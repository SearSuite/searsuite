import { defineStateObservation, type ObservationRegistry } from '@searsuite/sear-foundation-subscription';

import { type DocDocumentSessionCoordinator } from './DocDocumentSessionCoordinator';
import { type DocEditorChange } from './DocKernelContracts';

/** Committed document content exposed as an editor-local typed state observation. */
export const DocDocumentObservation = defineStateObservation<DocEditorChange>('doc.document');

/** Registers the document-owned read projection with the editor observation registry. */
export function registerDocDocumentObservation(
  observations: ObservationRegistry,
  document: DocDocumentSessionCoordinator,
): void {
  observations.register(DocDocumentObservation, {
    getSnapshot: document.getChangeSnapshot.bind(document),
    subscribe: document.subscribe.bind(document),
  });
}
