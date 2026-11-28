import {
  DocEditModel,
  type SheetEditInput,
  type SheetInlineStyleUpdate,
  type SheetTextSelection,
} from '@searsuite/sear-assembly-doc';
import {
  type DocSelection,
  getDocumentOffset,
  paraText,
  resolveTextContent,
  type RichDocNode,
} from '@searsuite/sear-domain-doc';
import { type Schema } from '@searsuite/sear-domain-doc-schema';
import { SearError } from '@searsuite/sear-foundation-error';
import {
  type SheetCompositionState,
  type SheetCursorState,
  type SheetEditRenderOptions,
  type SheetEditSession,
  type SheetEmbeddedEditorContext,
  type SheetPointerInput,
  type SheetRenderUpdate,
} from '@searsuite/sear-sheet-editor-contract';
import { createDocumentEndSelection, toDocSelection } from './DocumentBoundary';
import { SearCoreEditorRuntime } from './SearCoreEditorRuntime';
import { createSheetUpdate } from './SheetEditorUpdate';

/** Renders and hit-tests an edit model owned independently of the view. */
export class SearCoreEditSession implements SheetEditSession {
  readonly #runtime: SearCoreEditorRuntime;
  readonly #context: SheetEmbeddedEditorContext;
  readonly #model: DocEditModel;
  readonly #ownsModel: boolean;
  readonly #onFinish: () => void;
  readonly #onStyleChange: () => void;
  readonly #onHistoryChange: () => void;
  readonly #ownerToken: object;
  #pointerAnchor: DocSelection | null = null;
  #disposed = false;
  #finished = false;
  #stopModel: (() => void) | undefined;
  public constructor(
    runtime: SearCoreEditorRuntime,
    context: SheetEmbeddedEditorContext,
    document: Schema[],
    onFinish: () => void,
    onStyleChange: () => void = () => {},
    onHistoryChange: () => void = () => {},
    ownerToken: object = {},
    model?: DocEditModel,
  ) {
    this.#runtime = runtime;
    this.#context = context;
    this.#onFinish = onFinish;
    this.#onStyleChange = onStyleChange;
    this.#onHistoryChange = onHistoryChange;
    this.#ownerToken = ownerToken;
    this.#ownsModel = !model;
    this.#model = model ?? new DocEditModel(document as RichDocNode[], () => this.#assertCommand());
    try {
      runtime.sheetPlugins.notifyDocumentChanged(runtime.pluginContext(this.#model.getDocument()));
    } catch (error) {
      if (this.#ownsModel) this.#model.dispose();
      throw error;
    }
    this.#stopModel = this.#model.subscribe((change) => {
      if (change.kind === 'content')
        runtime.sheetPlugins.notifyDocumentChanged(runtime.pluginContext(this.#model.getDocument()));
      this.#onStyleChange();
      this.#onHistoryChange();
    });
  }
  public getDocument(): readonly Schema[] {
    this.#assertLive();
    return this.#model.getDocument();
  }
  public getSelection(): SheetTextSelection {
    this.#assertLive();
    return this.#model.getSelection();
  }
  public getHistoryStatus() {
    return this.#model.getHistoryStatus();
  }
  public getTypingStyle() {
    return this.#model.getTypingStyle();
  }
  public getCursor(): SheetCursorState | null {
    this.#assertLive();
    const info = this.#runtime.cursor.getCursor();
    if (!info) return null;
    const cell = this.#context.geometry.cellRect;
    return {
      rect: { x: info.x - cell.x, y: info.y - cell.y - info.height, width: 1, height: info.height },
      visible: info.visible,
    };
  }
  public getComposition(): SheetCompositionState | null {
    return this.#model.getComposition();
  }
  public handleInput(input: SheetEditInput): SheetRenderUpdate {
    this.#assertLive();
    this.#assertCommand();
    const transformed = this.#runtime.sheetPlugins.transformInput(
      input,
      this.#runtime.pluginContext(this.getDocument()),
    );
    if (transformed) this.#model.handleInput(transformed);
    return this.#update('content');
  }
  public setSelection(selection: SheetTextSelection): SheetRenderUpdate {
    this.#assertLive();
    this.#assertCommand();
    this.#model.setSelection(selection);
    return this.#update('selection');
  }
  public setInlineStyle(update: SheetInlineStyleUpdate): SheetRenderUpdate {
    this.#assertLive();
    this.#assertCommand();
    const transformed = this.#runtime.sheetPlugins.transformInlineStyle(
      update,
      this.#runtime.pluginContext(this.getDocument()),
    );
    if (transformed) this.#model.setInlineStyle(transformed);
    return this.#update('content');
  }
  public handlePointer(input: SheetPointerInput): SheetRenderUpdate {
    this.#assertLive();
    this.#assertCommand();
    const point = this.#context.geometry.toLocalPoint(input.point);
    const layout = this.#prepare();
    const position = this.#runtime.layout.resolveCursorFromPoint(point.x, point.y, layout.snapshot);
    if (input.type === 'pointerDown') {
      if ((input.clickCount ?? 1) >= 2) {
        const document = this.getDocument() as RichDocNode[],
          text = document.map(paraText).join('\n'),
          offset = getDocumentOffset(document, position);
        let start = offset,
          end = offset;
        const word = (char: string) => /[\p{L}\p{N}_]/u.test(char);
        while (start > 0 && word(text[start - 1])) start--;
        while (end < text.length && word(text[end])) end++;
        if (start !== end) {
          const selection = { anchor: this.#atOffset(start), head: this.#atOffset(end) };
          this.#pointerAnchor = selection;
          this.#model.setSelection(selection);
          return this.#update('selection');
        }
      }
      this.#pointerAnchor = { anchor: position, head: position };
    }
    this.#model.setSelection({
      anchor: this.#pointerAnchor?.anchor ?? this.#model.getSelection().anchor,
      head: position,
    });
    if (input.type === 'pointerUp') this.#pointerAnchor = null;
    return this.#update('selection');
  }
  public render(renderContext = this.#context.renderContext, options: SheetEditRenderOptions = {}): SheetRenderUpdate {
    this.#assertLive();
    const update = this.#update('content', options.cursorVisible ?? true);
    this.#runtime.drawEditor(
      this.#context,
      this.getDocument(),
      toDocSelection(this.getSelection()),
      renderContext,
      options.cursorVisible ?? true,
    );
    return update;
  }
  public commit(): readonly Schema[] {
    this.#assertLive();
    this.#assertCommand();
    if (this.#finished) return this.getDocument();
    const document = this.getDocument();
    const committed = this.#runtime.sheetPlugins.transformCommit(document, this.#runtime.pluginContext(document));
    if (!committed) return document;
    this.#model.commit();
    this.#context.documentAccessor.commit(committed);
    this.#runtime.sheetPlugins.notifyCommit(committed, this.#runtime.pluginContext(committed));
    this.#runtime.sheetViews.notifyCommit(committed, this.#runtime.viewContext(this.#context, committed));
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
    this.#model.cancel();
    this.#runtime.composition.clear();
    this.#runtime.sheetPlugins.notifyCancel(this.#runtime.pluginContext(this.getDocument()));
    this.#runtime.sheetViews.notifyCancel(this.#runtime.viewContext(this.#context, this.getDocument()));
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
    if (ownerToken !== this.#ownerToken) this.#assertCommand();
    this.#disposed = true;
    this.#stopModel?.();
    if (this.#ownsModel && ownerToken !== this.#ownerToken) this.#model.dispose();
    this.#onFinish();
  }
  #prepare(cursorVisible = true) {
    const composition = this.#model.getComposition();
    if (this.#runtime.composition.getText() !== (composition?.text ?? ''))
      this.#runtime.composition.setText(composition?.text ?? '');
    const prepared = this.#runtime.prepare(
      this.#context,
      this.getDocument(),
      toDocSelection(this.getSelection()),
      cursorVisible,
    );
    this.#model.setNavigationSnapshot(prepared.snapshot);
    return prepared;
  }
  #update(kind: 'content' | 'selection' | 'composition', cursorVisible = true): SheetRenderUpdate {
    const layout = this.#prepare(cursorVisible);
    const update = createSheetUpdate(
      this.#context,
      kind,
      this.getSelection(),
      this.getCursor(),
      this.getComposition(),
      { width: layout.positionRect.width, height: layout.positionRect.height },
    );
    const document = this.getDocument();
    this.#runtime.sheetViews.notifyRender(update, this.#runtime.viewContext(this.#context, document));
    return update;
  }
  #atOffset(offset: number) {
    const document = this.getDocument() as RichDocNode[];
    let remaining = offset;
    for (let p = 0; p < document.length; p++) {
      for (let c = 0; c < (document[p].content?.length ?? 0); c++) {
        const length = resolveTextContent(document, [p, c]).length;
        if (remaining <= length) return { path: [p, c], offset: remaining };
        remaining -= length;
      }
      if (p < document.length - 1) remaining--;
    }
    return createDocumentEndSelection(document).head;
  }
  #assertCommand(): void {
    if (this.#context.isCommandExecuting && !this.#context.isCommandExecuting())
      throw new SearError('Edit view mutations must run through a command using editor.commands.run(...).');
  }
  #assertLive(): void {
    if (this.#disposed) throw new SearError('Edit view is disposed.');
  }
}
