import { Pipeline } from '@searsuite/sear-assembly-core';
import {
  defineDocCommand,
  type DocCommandBus,
  type DocCommandContext,
  type DocCommandResult,
  type DocEditorCommand,
} from '@searsuite/sear-assembly-commands';

import { type DocDocumentSessionCoordinator } from './DocDocumentSessionCoordinator';
import { type DocDocumentState } from './DocEditorContracts';

/** Result of exporting detached document-owned state for an in-memory remount. */
export interface ExportDocStateCommandResult extends DocCommandResult {
  readonly documentState: DocDocumentState;
}

/** Exports the current document-owned state without local session values. */
export const ExportDocStateCommand = defineDocCommand<void, ExportDocStateCommandResult>('doc.exportState');

/** Registers the document-owned state snapshot command. */
export function registerDocStateSnapshotCommands(
  commands: DocCommandBus,
  document: DocDocumentSessionCoordinator,
): void {
  commands.register(ExportDocStateCommand, function createExportDocStateCommand() {
    return new ExportDocStateSnapshotCommand(document);
  });
}

class ExportDocStateSnapshotCommand implements DocEditorCommand<ExportDocStateCommandResult> {
  readonly #document: DocDocumentSessionCoordinator;

  public readonly id = ExportDocStateCommand.id;

  public constructor(document: DocDocumentSessionCoordinator) {
    this.#document = document;
  }

  public execute(_context: DocCommandContext): ExportDocStateCommandResult {
    return {
      pipeline: new Pipeline(this.id),
      documentState: { document: this.#document.getDocument() },
    };
  }
}
