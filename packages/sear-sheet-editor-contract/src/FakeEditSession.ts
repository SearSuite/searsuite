import { SearError } from '@searsuite/sear-foundation-error';
import { segmentTextGraphemes } from '@searsuite/sear-domain-doc';
import type { Schema } from '@searsuite/sear-domain-doc-schema';
import type { SheetEditRenderOptions, SheetEditSession } from './SheetEmbeddedEditor';
import type {
  SheetCompositionInput,
  SheetCompositionState,
  SheetCursorState,
  SheetEditInput,
  SheetEmbeddedEditorContext,
  SheetInlineStyleUpdate,
  SheetPointerInput,
  SheetRenderUpdate,
  SheetTextSelection,
} from './SheetEditorTypes';
import { cloneDocument } from './cloneDocument';
import { createUpdate } from './createUpdate';
import { firstTextNode } from './firstTextNode';

type RecordInput = (input: SheetEditInput) => void;
type RecordCommit = (document: Schema[]) => void;
type RecordCancel = () => void;

/** Deterministic text-editing session used by Sheet tests. */
export class FakeEditSession implements SheetEditSession {
  readonly #context: SheetEmbeddedEditorContext;
  readonly #document: Schema[];
  readonly #recordInput: RecordInput;
  readonly #recordCommit: RecordCommit;
  readonly #recordCancel: RecordCancel;

  #selection: SheetTextSelection = {
    anchor: { path: [0, 0], offset: 0 },
    head: { path: [0, 0], offset: 0 },
  };
  #composition = '';
  #cursor: SheetCursorState | null = null;
  #disposed = false;
  #finished = false;
  readonly #ownerToken: object;

  public constructor(
    context: SheetEmbeddedEditorContext,
    document: Schema[],
    recordInput: RecordInput,
    recordCommit: RecordCommit,
    recordCancel: RecordCancel,
    ownerToken: object = {},
  ) {
    this.#context = context;
    this.#document = document;
    this.#recordInput = recordInput;
    this.#recordCommit = recordCommit;
    this.#recordCancel = recordCancel;
    this.#ownerToken = ownerToken;
    const textNode = firstTextNode(this.#document);
    if (textNode) this.#collapseSelection(textNode.path, (textNode.node.text ?? '').length);
  }

  public getDocument(): readonly Schema[] {
    this.#assertLive();
    return cloneDocument(this.#document);
  }

  public getSelection(): SheetTextSelection | null {
    this.#assertLive();
    return {
      anchor: { path: [...this.#selection.anchor.path], offset: this.#selection.anchor.offset },
      head: { path: [...this.#selection.head.path], offset: this.#selection.head.offset },
    };
  }

  public getCursor(): SheetCursorState | null {
    this.#assertLive();
    return this.#cursor ? { ...this.#cursor, rect: { ...this.#cursor.rect } } : null;
  }

  public getComposition(): SheetCompositionState | null {
    this.#assertLive();
    return this.#composition.length > 0 ? { active: true, text: this.#composition } : null;
  }

  public render(
    _renderContext?: import('@searsuite/sear-render-context').RenderContext,
    _options?: SheetEditRenderOptions,
  ): SheetRenderUpdate {
    this.#assertLive();
    return createUpdate(this.#context, 'render', this.#selection);
  }

  public handleInput(input: SheetEditInput): SheetRenderUpdate {
    this.#assertLive();
    this.#assertCommand();
    this.#recordInput(input);
    const textNode = firstTextNode(this.#document);
    if (input.type === 'insertText' && textNode) {
      const currentText = textNode.node.text ?? '';
      const [start, end] = this.#selectionOffsets(textNode.path, currentText.length);
      const nextText = `${currentText.slice(0, start)}${input.text}${currentText.slice(end)}`;
      textNode.node.text = nextText;
      this.#collapseSelection(textNode.path, start + input.text.length);
    } else if (input.type === 'deleteContent' && textNode) {
      const count = Math.max(1, input.count ?? 1);
      const currentText = textNode.node.text ?? '';
      const [start, end] = this.#selectionOffsets(textNode.path, currentText.length);
      const deleteStart = start !== end ? start : input.direction === 'backward' ? Math.max(0, end - count) : start;
      const deleteEnd =
        start !== end ? end : input.direction === 'backward' ? end : Math.min(currentText.length, start + count);
      textNode.node.text = `${currentText.slice(0, deleteStart)}${currentText.slice(deleteEnd)}`;
      this.#collapseSelection(textNode.path, deleteStart);
    } else if (
      (input as SheetCompositionInput).type === 'compositionStart' ||
      (input as SheetCompositionInput).type === 'compositionUpdate'
    ) {
      this.#composition = (input as SheetCompositionInput).text ?? '';
    } else if ((input as SheetCompositionInput).type === 'compositionEnd') {
      this.#composition = '';
    } else if (input.type === 'keyDown' && textNode) {
      const currentText = textNode.node.text ?? '';
      const offset = this.#selection.head.offset;
      if ((input.ctrlKey || input.metaKey) && input.key.toLowerCase() === 'a') {
        this.#selection = {
          anchor: { path: textNode.path, offset: 0 },
          head: { path: textNode.path, offset: currentText.length },
        };
      } else if (input.key === 'ArrowLeft' || input.key === 'ArrowRight') {
        const ranges = segmentTextGraphemes(currentText);
        const nextOffset = input.key === 'ArrowLeft'
          ? ranges.find(({ start, end }) => start < offset && offset <= end)?.start ?? 0
          : ranges.find(({ start, end }) => start <= offset && offset < end)?.end ?? currentText.length;
        if (input.shiftKey) {
          this.#selection = { ...this.#selection, head: { path: textNode.path, offset: nextOffset } };
        } else {
          this.#collapseSelection(textNode.path, nextOffset);
        }
      } else if (input.key === 'Enter' && input.altKey) {
        const [start, end] = this.#selectionOffsets(textNode.path, currentText.length);
        textNode.node.text = `${currentText.slice(0, start)}\n${currentText.slice(end)}`;
        this.#collapseSelection(textNode.path, start + 1);
      }
    }
    return createUpdate(this.#context, input.type, this.#selection);
  }

  public handlePointer(input: SheetPointerInput): SheetRenderUpdate {
    this.#assertLive();
    this.#assertCommand();
    const point = this.#context.geometry.toLocalPoint(input.point);
    this.#cursor = { rect: { x: point.x, y: point.y, width: 1, height: 16 }, visible: true };
    this.#selection = {
      anchor: { path: [0, 0], offset: Math.max(0, Math.floor(point.x)) },
      head: { path: [0, 0], offset: Math.max(0, Math.floor(point.x)) },
    };
    return createUpdate(this.#context, input.type, this.#selection);
  }

  public setSelection(selection: SheetTextSelection): SheetRenderUpdate {
    this.#assertLive();
    this.#assertCommand();
    this.#selection = {
      anchor: { path: [...selection.anchor.path], offset: selection.anchor.offset },
      head: { path: [...selection.head.path], offset: selection.head.offset },
    };
    return createUpdate(this.#context, 'selection', this.#selection);
  }

  public setInlineStyle(update: SheetInlineStyleUpdate): SheetRenderUpdate {
    this.#assertLive();
    this.#assertCommand();
    const textNode = firstTextNode(this.#document);
    if (textNode) textNode.node.attrs = { ...(textNode.node.attrs ?? {}), textStyle: { ...update.attrs } };
    return createUpdate(this.#context, 'inline-style', this.#selection);
  }

  public commit(): readonly Schema[] {
    this.#assertLive();
    this.#assertCommand();
    if (this.#finished) return cloneDocument(this.#document);
    const snapshot = cloneDocument(this.#document);
    this.#context.documentAccessor.commit(snapshot);
    this.#recordCommit(snapshot);
    this.#finished = true;
    return snapshot;
  }

  public cancel(): void {
    this.#assertLive();
    this.#assertCommand();
    if (this.#finished) return;
    this.#finished = true;
    this.#recordCancel();
  }

  public dispose(ownerToken?: object): void {
    if (this.#disposed) return;
    if (this.#context.isCommandExecuting && !this.#context.isCommandExecuting() && ownerToken !== this.#ownerToken) {
      throw new SearError('Sheet edit session disposal must run through editor.commands.run(...).');
    }
    this.#disposed = true;
  }

  #assertLive(): void {
    if (this.#disposed) throw new SearError('FakeSheetEmbeddedEditor edit session has been disposed.');
  }

  #assertCommand(): void {
    if (this.#context.isCommandExecuting && !this.#context.isCommandExecuting()) {
      throw new SearError('Sheet edit session changes must run through editor.commands.run(...).');
    }
  }

  #selectionOffsets(path: readonly (number | string)[], length: number): [number, number] {
    const anchor = this.#selection.anchor.path.join('/') === path.join('/') ? this.#selection.anchor.offset : 0;
    const head = this.#selection.head.path.join('/') === path.join('/') ? this.#selection.head.offset : length;
    return [
      Math.max(0, Math.min(length, Math.min(anchor, head))),
      Math.max(0, Math.min(length, Math.max(anchor, head))),
    ];
  }

  #collapseSelection(path: readonly (number | string)[], offset: number): void {
    const position = { path: [...path], offset };
    this.#selection = { anchor: position, head: position };
  }
}
