import { SearError } from '@searsuite/sear-foundation-error';
import { Pipeline, runInsideCommandExecution } from '@searsuite/sear-assembly-core';
import { DocInputPlugin } from '@searsuite/sear-assembly-core';
import type { DocSelection } from '@searsuite/sear-domain-doc';
import { DocCursorDirection } from '@searsuite/sear-domain-commands';
import { buildInlineTextRangePatchPlan, getDocumentOffset, paraText, resolveNode, resolveTextContent, type RichDocNode } from '@searsuite/sear-domain-doc';
import {
  BoldTextStyleKey,
  ItalicTextStyleKey,
  UnderlineTextStyleKey,
  StrikethroughTextStyleKey,
} from '@searsuite/sear-assembly-doc';
import type { Schema } from '@searsuite/sear-domain-doc-schema';
import type { SheetEditRenderOptions, SheetEditSession } from '@searsuite/sear-sheet-editor-contract';
import type { SheetEmbeddedEditHistoryState } from '@searsuite/sear-sheet-editor-contract';
import type {
  SheetCompositionState,
  SheetCursorState,
  SheetEditInput,
  SheetEmbeddedEditorContext,
  SheetInlineStyleUpdate,
  SheetPointerInput,
  SheetRenderUpdate,
  SheetTextSelection,
} from '@searsuite/sear-sheet-editor-contract';
import { createDocumentEndSelection, ensureEditableDocument, toDocSelection } from './DocumentBoundary';
import { createSheetUpdate } from './SheetEditorUpdate';
import { SearCoreEditorRuntime } from './SearCoreEditorRuntime';
import { SearCoreEditHistory } from './SearCoreEditHistory';

/** Active editing session backed by the adapter's single DocInputPlugin. */
export class SearCoreEditSession implements SheetEditSession {
  #disposed = false;
  #finished = false;
  #pointerAnchor: DocSelection | null = null;
  readonly #originalDocument: Schema[];
  readonly #history: SearCoreEditHistory;
  readonly #typingStyle: Record<string, unknown> = {};
  readonly #runtime: SearCoreEditorRuntime;
  readonly #context: SheetEmbeddedEditorContext;
  readonly #onFinish: () => void;
  readonly #onStyleChange: () => void;
  readonly #onHistoryChange: () => void;
  readonly #ownerToken: object;

  public constructor(
    runtime: SearCoreEditorRuntime,
    context: SheetEmbeddedEditorContext,
    document: Schema[],
    onFinish: () => void,
    onStyleChange: () => void = () => {},
    onHistoryChange: () => void = () => {},
    ownerToken: object = {},
  ) {
    this.#context = context;
    this.#onFinish = onFinish;
    this.#onStyleChange = onStyleChange;
    this.#onHistoryChange = onHistoryChange;
    this.#ownerToken = ownerToken;
    this.#runtime = runtime;
    this.#history = new SearCoreEditHistory(runtime);
    this.#originalDocument = ensureEditableDocument(document);
    const initialSelection = createDocumentEndSelection(this.#originalDocument);
    const runtimeDocument = this.#runtime.core.materializeSnapshot(this.#originalDocument);
    this.#replaceSessionDocument('sheet.embedded.startSession', runtimeDocument, initialSelection);
  }

  public getDocument(): readonly Schema[] {
    this.#assertLive();
    return this.#runtime.core.exportSnapshot(this.#runtime.input.session.pendingDoc);
  }

  public getHistoryStatus(): SheetEmbeddedEditHistoryState {
    return { editing: true, ...this.#history.getStatus() };
  }

  public getTypingStyle(): Readonly<Record<string, unknown>> {
    return JSON.parse(JSON.stringify(this.#typingStyle)) as Record<string, unknown>;
  }

  public getSelection(): SheetTextSelection | null {
    this.#assertLive();
    return toSheetSelection(this.#runtime.input.session.docSelection);
  }

  public getCursor(): SheetCursorState | null {
    this.#assertLive();
    return this.#readCursor();
  }

  public getComposition(): SheetCompositionState | null {
    this.#assertLive();
    const text = this.#runtime.composition.getText();
    return text ? { active: true, text, rect: this.#readCursor()?.rect } : null;
  }

  public render(renderContext = this.#context.renderContext, options: SheetEditRenderOptions = {}): SheetRenderUpdate {
    this.#assertLive();
    const cursorVisible = options.cursorVisible ?? true;
    const update = this.#update('content', undefined, cursorVisible);
    this.#runtime.drawEditor(
      this.#context,
      this.#runtime.core.exportSnapshot(this.#runtime.input.session.pendingDoc),
      this.#runtime.input.session.docSelection,
      renderContext,
      cursorVisible,
    );
    return update;
  }

  public handleInput(input: SheetEditInput): SheetRenderUpdate {
    this.#assertLive();
    this.#assertCommand();
    const transformed = this.#runtime.sheetPlugins.transformInput(
      input,
      this.#runtime.pluginContext(this.#context, this.getDocument()),
    );
    if (!transformed) return this.#update('selection');
    input = transformed;
    if (input.type === 'insertText') {
      this.#runtime.composition.clear();
      const lines = input.text.replace(/\r\n?/g, '\n').split('\n');
      let recorded = false;
      for (const [index, line] of lines.entries()) {
        if (index > 0) {
          this.#executeTransaction('sheet.embedded.pasteLineBreak', () => this.#runtime.input.createSoftEnterTransaction());
          if (recorded) this.#history.mergeLastTwo();
          recorded = true;
        }
        if (!line && lines.length > 1) continue;
        this.#executeTransaction('sheet.embedded.insertText', () => this.#runtime.input.createInputTransaction(line));
        if (Object.keys(this.#typingStyle).length && line.length) {
          const after = this.#runtime.input.session.docSelection.head;
          const caretOffset = getDocumentOffset(this.#runtime.input.session.pendingDoc, after);
          this.#runtime.input.restoreSelection({
            anchor: { path: [...after.path], offset: after.offset - line.length },
            head: { path: [...after.path], offset: after.offset },
          });
          this.setInlineStyle({ attrs: this.#typingStyle });
          this.#runtime.input.restoreSelection(this.#selectionAtOffset(caretOffset));
          this.#history.mergeLastTwo();
        }
        if (recorded) this.#history.mergeLastTwo();
        recorded = true;
      }
      return this.#update('content');
    }
    if (input.type === 'deleteContent') {
      this.#runtime.composition.clear();
      const count = Math.max(1, input.count ?? 1);
      for (let index = 0; index < count; index += 1) {
        if (input.direction === 'forward' && isCollapsed(this.#runtime.input.session.docSelection)) {
          this.#executeTransaction('sheet.embedded.moveRight', () =>
            this.#runtime.input.createArrowTransaction(DocCursorDirection.Right, false),
          );
        }
        this.#executeTransaction('sheet.embedded.deleteContent', () => this.#runtime.input.createDeleteTransaction());
      }
      return this.#update('content');
    }
    if (input.type === 'compositionStart' || input.type === 'compositionUpdate') {
      this.#runtime.composition.setText(input.text ?? '');
      return this.#update('composition');
    }
    if (input.type === 'compositionEnd') {
      this.#runtime.composition.clear();
      return this.#update('composition', { active: false, text: '' });
    }

    if (input.type !== 'keyDown') return this.#update('selection');
    if ((input.ctrlKey || input.metaKey) && input.key.toLowerCase() === 'z') {
      if (input.shiftKey) this.#history.redo();
      else this.#history.undo();
      this.#onHistoryChange();
      return this.#update('content');
    }
    if ((input.ctrlKey || input.metaKey) && !input.shiftKey && input.key.toLowerCase() === 'y') {
      this.#history.redo();
      this.#onHistoryChange();
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
      this.#executeTransaction('sheet.embedded.selectAll', () => this.#runtime.input.createSelectAllTransaction());
      return this.#update('selection');
    }
    const direction = keyDirection(input.key);
    if (direction) {
      this.#executeTransaction(`sheet.embedded.arrow.${direction}`, () =>
        this.#runtime.input.createArrowTransaction(direction, input.shiftKey === true),
      );
      return this.#update('selection');
    }
    if (input.key === 'Enter') {
      this.#executeTransaction('sheet.embedded.softEnter', () => this.#runtime.input.createSoftEnterTransaction());
      return this.#update('content');
    }
    if (input.key === 'Backspace') {
      this.#executeTransaction('sheet.embedded.deleteBackward', () => this.#runtime.input.createDeleteTransaction());
      return this.#update('content');
    }
    return this.#update('selection');
  }

  #toggleInlineStyle(styleKey: string): SheetRenderUpdate {
    const state = this.#runtime.input.getState();
    const patches = buildInlineTextRangePatchPlan(state.pendingDoc, state.docSelection, () => ({}));
    const styles = patches.map((patch) => this.#runtime.inlineStyles.readTextNodeStyle(patch.oldNode));
    const currentNode = resolveNode(state.pendingDoc, state.docSelection.head.path);
    const currentStyle = currentNode ? this.#runtime.inlineStyles.readTextNodeStyle(currentNode) : undefined;
    const allStyled = patches.length > 0
      ? styles.every((style) => style?.[styleKey] === true)
      : (Object.hasOwn(this.#typingStyle, styleKey) ? this.#typingStyle[styleKey] : currentStyle?.[styleKey]) === true;
    return this.setInlineStyle({ attrs: { [styleKey]: allStyled ? null : true } });
  }

  public handlePointer(input: SheetPointerInput): SheetRenderUpdate {
    this.#assertLive();
    this.#assertCommand();
    const point = this.#context.geometry.toLocalPoint(input.point);
    const layout = this.#runtime.prepare(
      this.#context,
      this.#runtime.core.exportSnapshot(this.#runtime.input.session.pendingDoc),
      this.#runtime.input.session.docSelection,
      true,
    );
    const position = this.#runtime.core.resolveCursorFromPoint(point.x, point.y, layout.snapshot);
    if (input.type === 'pointerDown') {
      if ((input.clickCount ?? 1) >= 2) {
        const doc = this.#runtime.input.session.pendingDoc as RichDocNode[];
        const text = doc.map(paraText).join('\n');
        const offset = getDocumentOffset(doc, position);
        const isWordCharacter = (character: string): boolean => /[\p{L}\p{N}_]/u.test(character);
        let start = offset;
        let end = offset;
        while (start > 0 && isWordCharacter(text[start - 1])) start -= 1;
        while (end < text.length && isWordCharacter(text[end])) end += 1;
        if (start !== end) {
          const anchor = this.#selectionAtOffset(start).anchor;
          const head = this.#selectionAtOffset(end).head;
          this.#pointerAnchor = { anchor, head };
          this.#runtime.input.restoreSelection({ anchor, head });
          return this.#update('selection');
        }
      }
      this.#pointerAnchor = { anchor: position, head: position };
    }
    const anchor = this.#pointerAnchor?.anchor ?? this.#runtime.input.session.docSelection.anchor;
    this.#runtime.input.restoreSelection({ anchor, head: position });
    if (input.type === 'pointerUp') this.#pointerAnchor = null;
    return this.#update('selection');
  }

  public setSelection(selection: SheetTextSelection): SheetRenderUpdate {
    this.#assertLive();
    this.#assertCommand();
    this.#runtime.input.restoreSelection(toDocSelection(selection));
    return this.#update('selection');
  }

  public setInlineStyle(update: SheetInlineStyleUpdate): SheetRenderUpdate {
    this.#assertLive();
    this.#assertCommand();
    const transformed = this.#runtime.sheetPlugins.transformInlineStyle(
      update,
      this.#runtime.pluginContext(this.#context, this.getDocument()),
    );
    if (!transformed) return this.#update('selection');
    update = transformed;
    const entries = Object.entries(update.attrs);
    if (entries.length === 0) return this.#update('selection');
    if (isCollapsed(this.#runtime.input.session.docSelection)) {
      entries.forEach(([property, value]) => {
        this.#typingStyle[property] = value === undefined ? undefined : JSON.parse(JSON.stringify(value));
      });
      this.#onStyleChange();
      return this.#update('selection');
    }
    this.#executeTransaction('sheet.embedded.inlineStyle', () =>
      this.#runtime.input.createTransaction((transaction, state) => {
        for (const [property, value] of entries) {
          const mutation = this.#runtime.inlineStyles.getMutation(property);
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

  public commit(): readonly Schema[] {
    this.#assertLive();
    this.#assertCommand();
    if (this.#finished) return this.getDocument();
    const document = this.getDocument();
    const committed = this.#runtime.sheetPlugins.transformCommit(
      document,
      this.#runtime.pluginContext(this.#context, document),
    );
    if (!committed) return document;
    this.#context.documentAccessor.commit(committed);
    this.#runtime.sheetPlugins.notifyCommit(committed, this.#runtime.pluginContext(this.#context, committed));
    this.#context.invalidate?.({
      kind: 'content',
      rects: [this.#context.geometry.cellRect],
      reason: 'sheet-embedded-doc:commit',
    });
    this.#finished = true;
    this.#onFinish();
    return committed;
  }

  public cancel(): void {
    this.#assertLive();
    this.#assertCommand();
    if (this.#finished) return;
    this.#replaceSessionDocument(
      'sheet.embedded.cancelSession',
      this.#runtime.core.materializeSnapshot(this.#originalDocument),
    );
    this.#runtime.composition.clear();
    this.#runtime.sheetPlugins.notifyCancel(this.#runtime.pluginContext(this.#context, this.getDocument()));
    this.#context.invalidate?.({
      kind: 'content',
      rects: [this.#context.geometry.cellRect],
      reason: 'sheet-embedded-doc:cancel',
    });
    this.#finished = true;
    this.#onFinish();
  }

  public dispose(ownerToken?: object): void {
    if (this.#disposed) return;
    if (this.#context.isCommandExecuting && !this.#context.isCommandExecuting() && ownerToken !== this.#ownerToken) {
      throw new SearError('Sheet edit session disposal must run through editor.commands.run(...).');
    }
    this.#disposed = true;
    this.#pointerAnchor = null;
    if (ownerToken !== this.#ownerToken) this.#runtime.composition.clear();
    this.#onFinish();
  }

  #executeTransaction(name: string, create: () => ReturnType<DocInputPlugin['createInputTransaction']>): void {
    const before = this.#runtime.input.session.docSelection;
    const transaction = create();
    runInsideCommandExecution(name, () => {
      this.#runtime.core.executePipeline(new Pipeline(name).addTransaction(name, transaction));
    });
    this.#history.record(transaction, before, this.#runtime.input.session.docSelection);
    this.#onHistoryChange();
  }

  #replaceSessionDocument(name: string, document: RichDocNode[], selection?: DocSelection): void {
    const transaction = this.#runtime.input.createReplaceDocumentTransaction(document, selection);
    runInsideCommandExecution(name, () => {
      this.#runtime.core.executePipeline(new Pipeline(name).addTransaction(name, transaction));
    });
  }

  #selectionAtOffset(offset: number): DocSelection {
    const doc = this.#runtime.input.session.pendingDoc as RichDocNode[];
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

  #update(
    kind: 'content' | 'selection' | 'composition',
    composition?: SheetCompositionState,
    cursorVisible = true,
  ): SheetRenderUpdate {
    const selection = toSheetSelection(this.#runtime.input.session.docSelection);
    const layout = this.#runtime.prepare(
      this.#context,
      this.#runtime.core.exportSnapshot(this.#runtime.input.session.pendingDoc),
      this.#runtime.input.session.docSelection,
      cursorVisible,
    );
    const update = createSheetUpdate(
      this.#context,
      kind,
      selection,
      this.#readCursor(),
      composition ?? this.#readComposition(),
      {
        width: layout.positionRect.width,
        height: layout.positionRect.height,
      },
    );
    this.#runtime.sheetPlugins.notifyRender(
      update,
      this.#runtime.pluginContext(this.#context, this.#runtime.core.exportSnapshot(this.#runtime.input.session.pendingDoc)),
    );
    return update;
  }

  #readCursor(): SheetCursorState | null {
    const info = this.#runtime.cursor.getCursor();
    if (!info) return null;
    const cell = this.#context.geometry.cellRect;
    return {
      rect: { x: info.x - cell.x, y: info.y - cell.y - info.height, width: 1, height: info.height },
      visible: info.visible,
    };
  }

  #readComposition(): SheetCompositionState | null {
    const text = this.#runtime.composition.getText();
    const cursor = this.#readCursor();
    return text ? { active: true, text, rect: cursor?.rect } : null;
  }

  #assertLive(): void {
    if (this.#disposed) throw new SearError('SearCoreEditorAdapter edit session has been disposed.');
  }

  #assertCommand(): void {
    if (this.#context.isCommandExecuting && !this.#context.isCommandExecuting()) {
      throw new SearError('Sheet edit session changes must run through a command.');
    }
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
