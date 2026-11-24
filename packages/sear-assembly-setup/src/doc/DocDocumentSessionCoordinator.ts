import { DocCursorManager, DocInputPlugin } from '@searsuite/sear-assembly-core';
import { cloneRichDocument, RichDocNode, TextNode, normalizeDocForEdit } from '@searsuite/sear-domain-doc';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';

import { type DocEditorChange } from './DocEditorContracts';

/** Owns rich-document session state and host-facing document snapshots. */
@Injectable()
export class DocDocumentSessionCoordinator {
  readonly #inputPlugin: DocInputPlugin;
  readonly #cursorManager: DocCursorManager;

  /** DI token for resolving the session coordinator. */
  public static readonly symbol = Symbol.for('DocDocumentSessionCoordinator');

  /** Creates a document session coordinator. */
  public constructor(
    @Inject(DocInputPlugin.symbol)
    inputPlugin: DocInputPlugin,
    @Inject(DocCursorManager.symbol)
    cursorManager: DocCursorManager,
  ) {
    this.#inputPlugin = inputPlugin;
    this.#cursorManager = cursorManager;
  }

  /** Replaces the active document and resets transient cursor/session state. */
  public loadDocument(document: RichDocNode[]): void {
    const nextDocument = createDocument(document);
    this.#inputPlugin.resetSession(nextDocument, {
      anchor: { path: [0, 0], offset: 0 },
      head: { path: [0, 0], offset: 0 },
    });
    this.#cursorManager.clearCursor();
  }

  /** Returns a detached host-facing snapshot from the committed document state. */
  public getChangeSnapshot(): DocEditorChange {
    return {
      document: this.getDocument(),
      text: this.getText(),
    };
  }

  /** Subscribes to committed document projection changes. */
  public subscribe(listener: (change: DocEditorChange) => void): () => void {
    return this.#inputPlugin.subscribeDocument(() => listener(this.getChangeSnapshot()));
  }

  /** Returns a clone of the current rich-document content. */
  public getDocument(): RichDocNode[] {
    return cloneRichDocument(this.#inputPlugin.session.pendingDoc);
  }

  /** Returns a plain-text view of the current document. */
  public getText(): string {
    return readPlainText(this.#inputPlugin.session.pendingDoc);
  }
}

function createDocument(document: RichDocNode[]): RichDocNode[] {
  return cloneRichDocument(normalizeDocForEdit(document));
}

function readPlainText(document: RichDocNode[]): string {
  return document
    .map((paragraph) => (paragraph.content as TextNode[]).map((node) => node.text ?? '').join(''))
    .join('\n');
}
