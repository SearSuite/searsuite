import { runOutsideCommandExecution } from '@searsuite/sear-assembly-plugin';
import { DocCursorDirection } from '@searsuite/sear-domain-commands';
import {
  DocNodeRegistry,
  RichTextBlockFlowRegistry,
  RichTextInlineStyleRegistry,
  applyRichTextFormat,
  buildInlineTextRangePatchPlan,
  captureRichTextFormat,
  cloneRichDocument,
  getDocumentOffset,
  normalizeDocForEdit,
  registerParagraphDocNode,
  registerTextDocNode,
  resolveNode,
  resolveTextContent,
  type DocSelection,
  type RichDocNode,
} from '@searsuite/sear-domain-doc';
import { DocLayoutEngine, type LayoutSnapshot } from '@searsuite/sear-domain-editor';
import { type Transaction } from '@searsuite/sear-domain-transaction';
import { SearError } from '@searsuite/sear-foundation-error';
import { BoldTextStyleKey, createBoldContribution } from '../inlinePlugin/bold/BoldTextStylePlugin';
import { createFontFamilyContribution } from '../inlinePlugin/fontFamily/FontFamilyTextStylePlugin';
import { createFontSizeContribution } from '../inlinePlugin/fontSize/FontSizeTextStylePlugin';
import { ItalicTextStyleKey, createItalicContribution } from '../inlinePlugin/italic/ItalicTextStylePlugin';
import {
  StrikethroughTextStyleKey,
  createStrikethroughContribution,
} from '../inlinePlugin/strikethrough/StrikethroughTextStylePlugin';
import { createTextColorContribution } from '../inlinePlugin/textColor/TextColorStylePlugin';
import { UnderlineTextStyleKey, createUnderlineContribution } from '../inlinePlugin/underline/UnderlineTextStylePlugin';
import { DocEditHistory } from './DocEditHistory';
import { type SheetEditInput, type SheetInlineStyleUpdate, type SheetTextSelection } from './DocEditInput';
import { DocInputPlugin } from './DocInputPlugin';

/** Semantic draft change delivered without a rendering lifecycle. */
export interface DocEditModelChange {
  readonly kind: 'content' | 'selection' | 'composition';
}

export interface DocEditModelUpdate {
  readonly selection: SheetTextSelection;
  readonly composition?: { readonly active: boolean; readonly text: string };
}
/** Owns one editable document, selection, composition, inline style and OT history without a view. */
export class DocEditModel {
  readonly #input: DocInputPlugin;
  readonly #inlineStyles = createDocEditStyleRegistry();
  readonly #history: DocEditHistory;
  readonly #typingStyle: Record<string, unknown> = {};
  readonly #originalDocument: RichDocNode[];
  readonly #assertWrite: () => void;
  readonly #onListenerError: (error: unknown) => void;
  #composition = '';
  readonly #listeners = new Set<(change: DocEditModelChange) => void>();
  /** Observes future changes and returns an idempotent subscription disposer. */
  public subscribe(listener: (change: DocEditModelChange) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  #disposed = false;
  #finished = false;
  public constructor(
    document: readonly RichDocNode[],
    assertWrite: () => void = () => {},
    onListenerError: (error: unknown) => void = () => {},
  ) {
    this.#assertWrite = assertWrite;
    this.#onListenerError = onListenerError;
    const nodes = new DocNodeRegistry();
    registerParagraphDocNode(nodes);
    registerTextDocNode(nodes);
    this.#input = new DocInputPlugin(new DocLayoutEngine(new RichTextBlockFlowRegistry()), nodes);
    this.#originalDocument = normalizeDocForEdit(cloneRichDocument(document));
    this.#input.resetSession(this.#originalDocument, createDocumentEndSelection(this.#originalDocument));

    this.#history = new DocEditHistory(this.#input, (transaction) => this.#apply(transaction));
  }
  /** Returns a detached snapshot of the current editable document. */
  public getDocument(): readonly RichDocNode[] {
    this.#assertLive();
    return cloneRichDocument(this.#input.session.pendingDoc);
  }
  /** Returns detached anchor and head positions within the editable document. */
  public getSelection(): SheetTextSelection {
    this.#assertLive();
    return toSheetSelection(this.#input.session.docSelection);
  }
  /** Returns the transient composition text, or null outside composition. */
  public getComposition(): { active: boolean; text: string } | null {
    return this.#composition ? { active: true, text: this.#composition } : null;
  }
  /** Reports undo and redo availability for the active edit draft. */
  public getHistoryStatus() {
    return { editing: true, ...this.#history.getStatus() };
  }
  /** Returns detached inline attributes to apply to subsequently inserted text. */
  public getTypingStyle(): Readonly<Record<string, unknown>> {
    return JSON.parse(JSON.stringify(this.#typingStyle));
  }
  /** Supplies detached logical line geometry for vertical movement; this stores no renderer. */
  public setNavigationSnapshot(snapshot: LayoutSnapshot): void {
    this.#assertLive();
    this.#input.setLastSnapshot(snapshot);
  }

  /** Applies one semantic editing input under the owning command authority. */
  public handleInput(input: SheetEditInput): DocEditModelUpdate {
    this.#assertLive();
    this.#assertCommand();
    if (input.type === 'insertText') {
      this.#composition = '';
      const lines = input.text.replace(/\r\n?/g, '\n').split('\n');
      let recorded = false;
      for (const [index, line] of lines.entries()) {
        if (index > 0) {
          this.#executeTransaction('sheet.embedded.pasteLineBreak', () => this.#input.createSoftEnterTransaction());
          if (recorded) this.#history.mergeLastTwo();
          recorded = true;
        }
        if (!line && lines.length > 1) continue;
        this.#executeTransaction('sheet.embedded.insertText', () => this.#input.createInputTransaction(line));
        if (Object.keys(this.#typingStyle).length && line.length) {
          const after = this.#input.session.docSelection.head;
          const caretOffset = getDocumentOffset(this.#input.session.pendingDoc, after);
          this.#input.restoreSelection({
            anchor: { path: [...after.path], offset: after.offset - line.length },
            head: { path: [...after.path], offset: after.offset },
          });
          this.setInlineStyle({ attrs: this.#typingStyle });
          this.#input.restoreSelection(this.#selectionAtOffset(caretOffset));
          this.#history.mergeLastTwo();
        }
        if (recorded) this.#history.mergeLastTwo();
        recorded = true;
      }
      return this.#update('content');
    }
    if (input.type === 'deleteContent') {
      this.#composition = '';
      const count = Math.max(1, input.count ?? 1);
      for (let index = 0; index < count; index += 1) {
        if (input.direction === 'forward' && isCollapsed(this.#input.session.docSelection)) {
          this.#executeTransaction('sheet.embedded.moveRight', () =>
            this.#input.createArrowTransaction(DocCursorDirection.Right, false),
          );
        }
        this.#executeTransaction('sheet.embedded.deleteContent', () => this.#input.createDeleteTransaction());
      }
      return this.#update('content');
    }
    if (input.type === 'compositionStart' || input.type === 'compositionUpdate') {
      this.#composition = input.text ?? '';
      return this.#update('composition');
    }
    if (input.type === 'compositionEnd') {
      this.#composition = '';
      return this.#update('composition', { active: false, text: '' });
    }

    if (input.type !== 'keyDown') return this.#update('selection');
    if ((input.ctrlKey || input.metaKey) && input.key.toLowerCase() === 'z') {
      if (input.shiftKey) this.#history.redo();
      else this.#history.undo();
      return this.#update('content');
    }
    if ((input.ctrlKey || input.metaKey) && !input.shiftKey && input.key.toLowerCase() === 'y') {
      this.#history.redo();
      return this.#update('content');
    }
    if ((input.ctrlKey || input.metaKey) && !input.shiftKey) {
      const key = input.key.toLowerCase();
      if (key === 'b') return this.#toggleInlineStyle(BoldTextStyleKey.Bold);
      if (key === 'i') return this.#toggleInlineStyle(ItalicTextStyleKey.Italic);
      if (key === 'u') return this.#toggleInlineStyle(UnderlineTextStyleKey.Underline);
    }
    if ((input.ctrlKey || input.metaKey) && input.shiftKey && input.key.toLowerCase() === 'x') {
      return this.#toggleInlineStyle(StrikethroughTextStyleKey.Strikethrough);
    }
    if ((input.metaKey || input.ctrlKey) && input.key.toLowerCase() === 'a') {
      this.#executeTransaction('sheet.embedded.selectAll', () => this.#input.createSelectAllTransaction());
      return this.#update('selection');
    }
    const direction = keyDirection(input.key);
    if (direction) {
      this.#executeTransaction(`sheet.embedded.arrow.${direction}`, () =>
        this.#input.createArrowTransaction(direction, input.shiftKey === true),
      );
      return this.#update('selection');
    }
    if (input.key === 'Enter') {
      this.#executeTransaction('sheet.embedded.softEnter', () => this.#input.createSoftEnterTransaction());
      return this.#update('content');
    }
    if (input.key === 'Backspace') {
      this.#executeTransaction('sheet.embedded.deleteBackward', () => this.#input.createDeleteTransaction());
      return this.#update('content');
    }
    return this.#update('selection');
  }

  #toggleInlineStyle(styleKey: string): DocEditModelUpdate {
    const state = this.#input.getState();
    const patches = buildInlineTextRangePatchPlan(state.pendingDoc, state.docSelection, () => ({}));
    const styles = patches.map((patch) => this.#inlineStyles.readTextNodeStyle(patch.oldNode));
    const currentNode = resolveNode(state.pendingDoc, state.docSelection.head.path);
    const currentStyle = currentNode ? this.#inlineStyles.readTextNodeStyle(currentNode) : undefined;
    const allStyled =
      patches.length > 0
        ? styles.every((style) => style?.[styleKey] === true)
        : (Object.hasOwn(this.#typingStyle, styleKey) ? this.#typingStyle[styleKey] : currentStyle?.[styleKey]) ===
          true;
    return this.setInlineStyle({ attrs: { [styleKey]: allStyled ? null : true } });
  }

  /** Updates the editable document selection under the owning command authority. */
  public setSelection(selection: SheetTextSelection): DocEditModelUpdate {
    this.#assertLive();
    this.#assertCommand();
    this.#input.restoreSelection(toDocSelection(selection));
    return this.#update('selection');
  }

  /** Applies inline attributes to selected text or the active typing style. */
  public setInlineStyle(update: SheetInlineStyleUpdate): DocEditModelUpdate {
    this.#assertLive();
    this.#assertCommand();
    const entries = Object.entries(update.attrs);
    if (entries.length === 0) return this.#update('selection');
    if (isCollapsed(this.#input.session.docSelection)) {
      entries.forEach(([property, value]) => {
        this.#typingStyle[property] = value === undefined ? undefined : JSON.parse(JSON.stringify(value));
      });
      return this.#update('selection');
    }
    this.#executeTransaction('sheet.embedded.inlineStyle', () =>
      this.#input.createTransaction((transaction, state) => {
        for (const [property, value] of entries) {
          const mutation = this.#inlineStyles.getMutation(property);
          transaction.setInlineTextStyle(
            state.pendingDoc,
            state.docSelection,
            property,
            value ?? null,
            mutation ? (attrs) => mutation.apply({ attrs, value: value ?? null }) : undefined,
          );
        }
        return transaction;
      }),
    );
    return this.#update('content');
  }

  #selectionAtOffset(offset: number): DocSelection {
    const doc = this.#input.session.pendingDoc as RichDocNode[];
    let remaining = offset;
    for (let paragraph = 0; paragraph < doc.length; paragraph += 1) {
      const children = doc[paragraph].content ?? [];
      for (let child = 0; child < children.length; child += 1) {
        const length = resolveTextContent(doc, [paragraph, child]).length;
        if (remaining <= length) {
          const position = { path: [paragraph, child], offset: remaining };
          return { anchor: position, head: position };
        }
        remaining -= length;
      }
      if (paragraph < doc.length - 1) remaining -= 1;
    }
    return createDocumentEndSelection(doc);
  }

  #assertLive(): void {
    if (this.#disposed) throw new SearError('SearCoreEditorAdapter edit session has been disposed.');
  }
  /** Finishes the draft and returns its detached document for atomic Sheet commit planning. */
  public commit(): readonly RichDocNode[] {
    this.#assertLive();
    this.#assertCommand();
    this.#finished = true;
    return this.getDocument();
  }
  /** Restores the original draft document without changing committed Sheet content. */
  public cancel(): void {
    this.#assertLive();
    this.#assertCommand();
    if (this.#finished) return;
    this.#input.resetSession(cloneRichDocument(this.#originalDocument));
    this.#composition = '';
    this.#finished = true;
  }
  /** Releases draft listeners and prevents further model access. */
  public dispose(): void {
    this.#assertCommand();
    this.#disposed = true;
    this.#listeners.clear();
  }
  #assertCommand(): void {
    this.#assertWrite();
  }
  #update(kind: DocEditModelChange['kind'], composition?: { active: boolean; text: string }): DocEditModelUpdate {
    runOutsideCommandExecution(() =>
      this.#listeners.forEach((listener) => {
        try {
          listener(Object.freeze({ kind }));
        } catch (error) {
          try {
            this.#onListenerError(error);
          } catch {
            /* Diagnostics cannot invalidate model updates. */
          }
        }
      }),
    );
    return { selection: this.getSelection(), ...(composition ? { composition } : {}) };
  }
  #executeTransaction(_name: string, create: () => Transaction): void {
    const before = this.#input.session.docSelection;
    const transaction = create();
    this.#apply(transaction);
    this.#history.record(transaction, before, this.#input.session.docSelection);
  }
  #apply(transaction: Transaction): void {
    const next = this.#input.apply(this.#input.session, transaction);
    if (next) this.#input.setState(next);
  }
}

function keyDirection(key: string): DocCursorDirection | null {
  if (key === 'ArrowLeft') return DocCursorDirection.Left;
  if (key === 'ArrowRight') return DocCursorDirection.Right;
  if (key === 'ArrowUp') return DocCursorDirection.Up;
  if (key === 'ArrowDown') return DocCursorDirection.Down;
  return null;
}

function isCollapsed(selection: DocSelection): boolean {
  return (
    selection.anchor.offset === selection.head.offset &&
    selection.anchor.path.join('/') === selection.head.path.join('/')
  );
}

function toSheetSelection(selection: DocSelection): SheetTextSelection {
  return {
    anchor: { path: [...selection.anchor.path], offset: selection.anchor.offset },
    head: { path: [...selection.head.path], offset: selection.head.offset },
  };
}

function toDocSelection(selection: SheetTextSelection): DocSelection {
  return {
    anchor: { path: selection.anchor.path.map(Number), offset: selection.anchor.offset },
    head: { path: selection.head.path.map(Number), offset: selection.head.offset },
  };
}
function createDocumentEndSelection(document: readonly RichDocNode[]): DocSelection {
  const p = Math.max(0, document.length - 1),
    c = Math.max(0, (document[p]?.content?.length ?? 1) - 1),
    position = { path: [p, c], offset: resolveTextContent(document as RichDocNode[], [p, c]).length };
  return { anchor: position, head: position };
}

export function createDocEditStyleRegistry(): RichTextInlineStyleRegistry {
  const registry = new RichTextInlineStyleRegistry();
  [
    createBoldContribution,
    createItalicContribution,
    createUnderlineContribution,
    createStrikethroughContribution,
    createFontFamilyContribution,
    createFontSizeContribution,
    createTextColorContribution,
  ].forEach((create) => registry.register(create()));
  return registry;
}
export function createDocDocumentFormatting() {
  const registry = createDocEditStyleRegistry();
  return {
    capture: (document: readonly RichDocNode[]) => captureRichTextFormat(document, registry),
    apply: (document: readonly RichDocNode[], format: Readonly<Record<string, unknown>>) =>
      applyRichTextFormat(document, format, registry),
  };
}
