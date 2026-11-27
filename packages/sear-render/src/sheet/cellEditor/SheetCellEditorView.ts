import {
  HandleCellEditorPointerCommand,
  BeginCellEditorDragSelectionCommand,
  EndCellEditorDragSelectionCommand,
  RequestCellEditorRenderCommand,
  type SheetCellEditorPointerInput,
} from './SheetCellEditorViewCommands';
import { ViewExtensionBase } from '@searsuite/sear-render-event-engine';
import { DocEditModel } from '@searsuite/sear-assembly-doc';
import {
  SheetCellEditorPlugin,
  SynchronizeCellEditModelCommand,
  type EditorState,
} from '@searsuite/sear-plugin-cell-editor';
import { RestartSheetSelectionNavigationCommand } from '../selection/SelectionViewCommands';
import {
  buildSelectionUpdate,
  readCellEditorGeometryFields,
  resolveReferenceHighlightBounds,
} from './SheetCellEditorGeometry';

import { SearError } from '@searsuite/sear-foundation-error';

import { SearCoreSheet } from '@searsuite/sear-assembly-core';
import { SheetMatrix } from '@searsuite/sear-domain-sheet';

import { DocCursorDirection } from '@searsuite/sear-domain-commands';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { EventWithOffsetAndTarget } from '@searsuite/sear-render-event-engine';
import { PositionRect, Rect as RectRange, Point } from '@searsuite/sear-foundation-rect';
import { Injectable } from '@searsuite/sear-foundation-di';

import { ConfigUnit, type SheetConfig } from '@searsuite/sear-assembly-config';
import { LocalActionCommand, SheetCommandBus, type SheetCommandDefinition } from '@searsuite/sear-assembly-commands';
import { Node } from '@searsuite/sear-render-node';
import { readSheetCellAlignments } from '@searsuite/sear-plugin-alignment';
import { CoordinateTransformer } from '@searsuite/sear-render-context';
import { createFontDescriptor, TextShaper } from '@searsuite/sear-render-metrics';
import { activeFixedRowOffsets } from '../SheetFreezeLayout';
import { getSheetRangePositionRect } from '../getSheetRangePositionRect';
import { SheetCellMergePlugin } from '@searsuite/sear-plugin-cell-merge';
import { readSheetFixedRows } from '@searsuite/sear-plugin-fixed-row';
import { readSheetFreeze } from '@searsuite/sear-plugin-freeze';
import { readSheetCellFormats, type CellFormatMatrix } from '@searsuite/sear-plugin-cell-format';
import { SheetSelectionPlugin, EnsureSelectionVisibleCommand } from '@searsuite/sear-plugin-selection';

import { readSheetDataMatrix } from '@searsuite/sear-domain-sheet';
import { type DataEngine } from '@searsuite/sear-domain-state';

import { type CSRMatrix, type DimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import { CellProperties, CellRegion, EmptyCell, EmbeddedEditorRenderNode } from '@searsuite/sear-render-registry';
import { TextInput, KeyboardRouter, PointerCapture } from '@searsuite/sear-render-input';
import { TextInputKind, type TextInputEvent } from '@searsuite/sear-domain-commands';
import { HexColor } from '@searsuite/sear-foundation-utils';

import { CursorRegistry, CursorEngine, CursorToken } from '@searsuite/sear-render-cursor';
import { RichDocNode, paraText, getDocumentOffset, cloneRichDocument } from '@searsuite/sear-domain-doc';
import {
  SheetEmbeddedEditor,
  type SheetEditSession,
  type SheetEmbeddedEditorContext,
} from '@searsuite/sear-sheet-editor-contract';

import { EDITOR_BORDER_COLOR } from './EditorViewStyles';
import { EditorCursorBlinker } from './EditorCursorBlinker';
import { Platform } from '@searsuite/sear-foundation-platform';

import { computeCellEditorOverflowLeftX } from './computeCellEditorOverflowLeftX';

import { Highlighter } from './Highlighter';
import { SheetCellEditorExitReason, SheetCellEditorPipelineName } from '@searsuite/sear-plugin-cell-editor';

import {
  OpenCellEditorCommand,
  CommitCellEditCommand,
  InsertCurrentDateTimeCommand,
  HandleDocumentInputCommand,
  ReplaceFormulaReferenceCommand,
  EndFormulaReferencePickCommand,
  UpdateFormulaAssistAnchorCommand,
  CycleFormulaReferenceCommand,
  HandleFormulaBarKeyCommand,
  type SheetCommitCellEditInput,
  type SheetDocumentInputCommandInput,
} from '@searsuite/sear-plugin-cell-editor';

import { type FormulaInputAssistState } from '@searsuite/sear-plugin-cell-editor';

import { FormulaReferencePickService, type FormulaEditDraft } from '@searsuite/sear-plugin-cell-editor';

import {
  canStartFormulaReferencePick,
  formatPickedReference,
  type PickedReferenceKind,
} from '@searsuite/sear-plugin-cell-editor';

const key = new PluginKey('SheetCellEditor');

interface SheetCellEditorConfig {
  /** Opaque editor surface that hides committed cell text and grid lines while editing. */
  editorBackgroundColor: string;
}

interface CellEditorSheetFields {
  sheetData: SheetMatrix;
  rowSizes: DimensionsCSRMatrix;
  columnSizes: DimensionsCSRMatrix;
  cellAlignments: CSRMatrix<string> | null;
  cellFormats: CellFormatMatrix | null;
}

function readCellEditorSheetFields(dataEngine: DataEngine): CellEditorSheetFields | null {
  const geometry = readCellEditorGeometryFields(dataEngine);
  const sheetData = readSheetDataMatrix(dataEngine);
  const cellAlignments = readSheetCellAlignments(dataEngine);
  const cellFormats = readSheetCellFormats(dataEngine);
  if (!sheetData || !geometry) return null;
  return { sheetData, rowSizes: geometry.rowSizes, columnSizes: geometry.columnSizes, cellAlignments, cellFormats };
}

/** Coordinates Sheet cell edit sessions, text input, and embedded editors. */
@Injectable()
export class SheetCellEditorView extends ViewExtensionBase<SearCoreSheet, CellProperties> {
  public static readonly symbol = Symbol.for('SheetCellEditorView');
  public readonly depth = 0;
  readonly #mergePlugin: SheetCellMergePlugin;
  readonly #selectionPlugin: SheetSelectionPlugin;
  readonly #onFillHandleDoubleClick: SheetCellEditorViewOptions['onFillHandleDoubleClick'];
  readonly #textInput: TextInput;
  readonly #keyboardRouter: KeyboardRouter;
  readonly #pointerCapture: PointerCapture;
  readonly #cursorRegistry: CursorRegistry;
  readonly #cursorEngine: CursorEngine;
  readonly #platform: Platform;
  readonly #highlighter: Highlighter;
  readonly #coordinates: CoordinateTransformer;
  /** Default visual configuration for the inline cell editor. */
  public static readonly defaultConfig: SheetCellEditorConfig = {
    editorBackgroundColor: '#ffffff',
  };

  /** True while the user is holding the mouse button and dragging to extend the text selection. */
  #isDragSelecting: boolean = false;
  #disposePointerCapture: (() => void) | null = null;
  #disposeEditKeyboardHandlers: (() => void) | null = null;
  readonly #embeddedEditor: SheetEmbeddedEditor | undefined;
  #embeddedContext: SheetEmbeddedEditorContext | null = null;

  // ─── Render cache ──────────────────────────────────────────────────────

  /** PositionRect from previous frame, used to union dirty region on size changes. */
  #lastEditorRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null = null;

  /** Leftmost X of center/right-aligned overflow text from the cell being edited. Used to mark a separate dirty rect for the overflow area so the grid cell is not redrawn there. */
  #lastOverflowLeftX: number | null = null;
  #commandCore: SearCoreSheet | null = null;
  #core: SearCoreSheet | null = null;
  #textShaper: TextShaper | undefined;
  #referencePickService: FormulaReferencePickService | undefined;
  #crossSheetReferencePick: { readonly start: Point; end: Point } | null = null;
  // ─── Dependencies ─────────────────────────────────────────────────────

  readonly #blinker: EditorCursorBlinker;
  #commands: SheetCommandBus | undefined;

  /** Binds this plugin to the core owned by its editor-local container. */
  #editSession: SheetEditSession | null = null;
  readonly #owner: SheetCellEditorPlugin;
  #activeModel: DocEditModel | null = null;
  readonly #disposers: (() => void)[] = [];
  public constructor(owner: SheetCellEditorPlugin, options: SheetCellEditorViewOptions) {
    super(new PluginKey('SheetCellEditorView'));
    this.#owner = owner;
    this.#mergePlugin = options.merges;
    this.#selectionPlugin = options.selection;
    this.#onFillHandleDoubleClick = options.onFillHandleDoubleClick;
    this.#textInput = options.textInput;
    this.#keyboardRouter = options.keyboard;
    this.#pointerCapture = options.pointer;
    this.#cursorRegistry = options.cursors;
    this.#cursorEngine = options.cursor;
    this.#platform = options.platform;
    this.#highlighter = options.highlighter;
    this.#coordinates = options.coordinates;
    this.#embeddedEditor = options.embeddedEditor;
    this.#textShaper = options.textShaper;
    this.#commands = options.commands;
    this.#referencePickService = options.references;
    this.#blinker = new EditorCursorBlinker(this.#platform, () => this.#requestRerender());
    this.#disposers.push(
      this.#cursorRegistry.register({
        kind: 'predicate',
        priority: 'high',
        test: this.#isCellEditorCursorTarget.bind(this),
        cursor: 'text',
      }),
    );
    this.#textInput.subscribe({
      onTextInput: this.#handleEditorTextInput.bind(this),
      onDelete: this.#handleEditorTextDelete.bind(this),
      onCut: () => this.#owner.readSelectedCellEditText(),
    });
    const dispose = this.#keyboardRouter.subscribe({
      onUnhandledEscape: () => this.#cancelPendingReferencePick(),
      onEscape: () => !this.#isEditing && this.#cancelPendingReferencePick(),
      onEdit: () =>
        this.#openCellEditor(this.#resolveCore(), ...this.#selectionPlugin.getState()[0].getPoint(0), false),
      onInsertCurrentDate: () => this.#insertCurrentDateTime('date'),
      onInsertCurrentTime: () => this.#insertCurrentDateTime('time'),
    });
    if (typeof dispose === 'function') this.#disposers.push(dispose);
  }
  get #isEditing() {
    return this.#owner.isEditing();
  }
  #cancelPendingReferencePick(): boolean {
    if (!this.#referencePickService?.hasPendingPick()) return false;
    this.#referencePickService.cancelPendingPick();
    return true;
  }
  get #session() {
    return this.#owner.readDocumentSession();
  }
  get #formulaAssistState() {
    return this.#owner.readFormulaAssist();
  }
  get #referencePick() {
    return this.#owner.readReferencePick();
  }
  get #lastPickedReference() {
    return this.#owner.readLastPickedReference();
  }
  public initializeView(core: SearCoreSheet): void {
    this.bindCore(core);
  }
  public onCommit(): void {
    this.#synchronizeEditView();
  }
  #resolveCore(): SearCoreSheet {
    if (!this.#core) throw new SearError('Cell editor view is not initialized.');
    return this.#core;
  }
  #getCommandBus(_core?: SearCoreSheet): SheetCommandBus {
    return this.#commands!;
  }
  #runCellEditorCommand<Input>(_core: SearCoreSheet, definition: SheetCommandDefinition<Input>, input: Input): void {
    this.#commands!.run(definition, input);
  }
  #executeEditorInput(input: SheetDocumentInputCommandInput): void {
    this.#commands!.run(HandleDocumentInputCommand, input);
    this.#blinker.reset();
  }
  #readFormulaDraft(): FormulaEditDraft | null {
    return this.#commands ? this.#owner.readFormulaDraft() : null;
  }
  #requestRerender(): void {
    this.#commands?.run(RequestCellEditorRenderCommand, undefined);
  }
  #insertCurrentDateTime(kind: 'date' | 'time'): boolean {
    this.#commands!.run(InsertCurrentDateTimeCommand, kind);
    return true;
  }
  #openCellEditor(_core: SearCoreSheet, row: number, col: number, replaceContent: boolean): void {
    this.#commands!.run(EnsureSelectionVisibleCommand, { anchor: [row, col], focus: [row, col] });
    this.#commands!.run(OpenCellEditorCommand, { row, column: col, replaceContent });
  }
  #handleEditorEnterKey(shiftKey: boolean, primaryModifier = false): void {
    this.#commands!.run(HandleFormulaBarKeyCommand, {
      action: 'enter',
      shiftKey,
      primaryModifier,
      minimumRowHeight: this.#measureMinimumRowHeight(),
    });
  }
  #measureMinimumRowHeight(): number | undefined {
    const lines = this.#owner.readDocumentSession().pendingDoc.map(paraText).join('\n').split('\n').length;
    if (lines < 2) return undefined;
    const config = readSheetConfig(this.#resolveCore());
    return Math.ceil(lines * (config.sheetCellFontSize ?? 10) * 1.5 + (config.cellPadding ?? 4) * 2);
  }
  #handleEditorEscapeKey(): void {
    this.#commands!.run(HandleFormulaBarKeyCommand, { action: 'escape' });
  }
  #handleEditorTabKey(shiftKey: boolean): void {
    this.#commands!.run(HandleFormulaBarKeyCommand, {
      action: 'tab',
      shiftKey,
      minimumRowHeight: this.#measureMinimumRowHeight(),
    });
  }
  #handleEditorSoftEnterKey(): void {
    this.#commands!.run(HandleFormulaBarKeyCommand, { action: 'softEnter' });
  }
  #handleEditorArrowLeft(shiftKey: boolean, primaryModifier: boolean, altKey = false): void {
    this.#commands!.run(
      HandleDocumentInputCommand,
      primaryModifier || altKey
        ? { kind: 'wordBoundary', boundary: 'previous', shiftKey }
        : { kind: 'arrow', direction: DocCursorDirection.Left, shiftKey },
    );
  }
  #handleEditorArrowRight(shiftKey: boolean, primaryModifier: boolean, altKey = false): void {
    this.#commands!.run(
      HandleDocumentInputCommand,
      primaryModifier || altKey
        ? { kind: 'wordBoundary', boundary: 'next', shiftKey }
        : { kind: 'arrow', direction: DocCursorDirection.Right, shiftKey },
    );
  }
  #handleEditorArrowUp(shiftKey: boolean): void {
    if (shiftKey) this.#executeEditorInput({ kind: 'arrow', direction: DocCursorDirection.Up, shiftKey });
    else this.#commands!.run(HandleFormulaBarKeyCommand, { action: 'suggestionUp' });
  }
  #handleEditorArrowDown(shiftKey: boolean): void {
    if (shiftKey) this.#executeEditorInput({ kind: 'arrow', direction: DocCursorDirection.Down, shiftKey });
    else this.#commands!.run(HandleFormulaBarKeyCommand, { action: 'suggestionDown' });
  }
  #moveEditorToLineBoundary(boundary: 'start' | 'end', shiftKey: boolean): void {
    this.#commands!.run(HandleDocumentInputCommand, { kind: 'lineBoundary', boundary, shiftKey });
  }
  #handleEditorSuggestionBoundary(boundary: 'start' | 'end', shiftKey: boolean): void {
    this.#commands!.run(HandleFormulaBarKeyCommand, {
      action: boundary === 'start' ? 'suggestionHome' : 'suggestionEnd',
    });
  }
  #handleEditorSuggestionPage(direction: -1 | 1, _shiftKey: boolean): void {
    this.#commands!.run(HandleFormulaBarKeyCommand, {
      action: direction === -1 ? 'suggestionPageUp' : 'suggestionPageDown',
    });
  }
  #handleEditorDeleteKey(direction: 'backward' | 'forward' = 'backward', byWord = false): void {
    this.#commands!.run(HandleDocumentInputCommand, { kind: 'delete', direction, byWord });
  }
  #handleEditorSelectAllKey(): void {
    this.#commands!.run(HandleDocumentInputCommand, { kind: 'selectAll' });
  }
  public registerCommands(commands: SheetCommandBus): void {
    commands.register(
      HandleCellEditorPointerCommand,
      (input) => new LocalActionCommand(HandleCellEditorPointerCommand.id, () => this.#handleEditorPointer(input)),
    );
    commands.register(
      BeginCellEditorDragSelectionCommand,
      () => new LocalActionCommand(BeginCellEditorDragSelectionCommand.id, () => this.#beginDragSelection()),
    );
    commands.register(
      EndCellEditorDragSelectionCommand,
      (input) =>
        new LocalActionCommand(EndCellEditorDragSelectionCommand.id, () =>
          this.#endDragSelection(input.disposeCapture),
        ),
    );
    commands.register(
      RequestCellEditorRenderCommand,
      () => new LocalActionCommand(RequestCellEditorRenderCommand.id, () => this.#core?.requestRender(this)),
    );
  }
  #synchronizeEditView(): void {
    const model = this.#owner.readEditModel();
    if (model === this.#activeModel) return;
    this.#editSession?.dispose();
    this.#editSession = null;
    this.#activeModel = model;
    if (!model) {
      this.#blinker.stop();
      this.#disposeEditKeyboardHandlers?.();
      this.#disposeEditKeyboardHandlers = null;
      this.#endDragSelection(true);
      this.#cursorEngine.override(null);
      this.#highlighter.clear();
      this.#lastEditorRect = null;
      this.#lastOverflowLeftX = null;
      this.#commands?.run(RestartSheetSelectionNavigationCommand, undefined);
      this.#textInput.refocus();
      return;
    }
    const [anchor, focus] = this.#owner.getState();
    const context = this.#createEmbeddedEditorContext(this.#resolveCore(), anchor.getPoint(0), focus.getPoint(1), [
      ...model.getDocument(),
    ]);
    this.#embeddedContext = context;
    this.#editSession = this.#embeddedEditor!.createEditSession(context, model);
    this.#textInput.startListener();
    this.#subscribeEditHandlers();
    this.#keyboardRouter.startListener();
    this.#blinker.start();
    this.#cursorEngine.override('text');
  }
  public destroyView(): void {
    this.#editSession?.dispose();
    this.#editSession = null;
    this.#blinker.stop();
    this.#disposeEditKeyboardHandlers?.();
    this.#endDragSelection(true);
    for (const dispose of this.#disposers.splice(0).reverse()) dispose();
    this.#cursorEngine.override(null);
    this.#core = null;
  }
  public bindCore(core: SearCoreSheet): void {
    if (this.#core && this.#core !== core) {
      throw new SearError('Sheet cell editor core is already bound to an editor.');
    }
    this.#core = core;
  }

  #handleEditorTextInput(event: TextInputEvent): void {
    this.#executeEditorInput(event);
  }

  #handleEditorTextDelete(): void {
    this.#executeEditorInput({ kind: 'delete' });
  }

  #subscribeEditHandlers(): void {
    this.#disposeEditKeyboardHandlers?.();
    const dispose = this.#keyboardRouter.subscribe({
      onDelete: this.#handleEditorDeleteKey.bind(this),
      onEnter: this.#handleEditorEnterKey.bind(this),
      onEscape: this.#handleEditorEscapeKey.bind(this),
      onToggleReference: () => this.#getCommandBus()?.run(CycleFormulaReferenceCommand, void 0),
      onArrowLeft: this.#handleEditorArrowLeft.bind(this),
      onArrowRight: this.#handleEditorArrowRight.bind(this),
      onArrowUp: this.#handleEditorArrowUp.bind(this),
      onArrowDown: this.#handleEditorArrowDown.bind(this),
      onHome: (_primaryModifier, shiftKey) => this.#moveEditorToLineBoundary('start', shiftKey),
      onEnd: (shiftKey) => this.#moveEditorToLineBoundary('end', shiftKey),
      onLineEnd: (shiftKey) => this.#handleEditorSuggestionBoundary('end', shiftKey),
      onPage: (direction, shiftKey) => this.#handleEditorSuggestionPage(direction, shiftKey),
      onSelectRow: () => this.#executeEditorInput({ kind: TextInputKind.Text, text: ' ' }),
      onFillDown: () => {},
      onFillRight: () => {},
      onCopyFormulaAbove: () => {},
      onTab: this.#handleEditorTabKey.bind(this),
      onSelectAll: this.#handleEditorSelectAllKey.bind(this),
      onSoftEnter: this.#handleEditorSoftEnterKey.bind(this),
      onToggleBold: () => this.#executeEditorInput({ kind: 'keyDown', key: 'b', ctrlKey: true }),
      onToggleItalic: () => this.#executeEditorInput({ kind: 'keyDown', key: 'i', ctrlKey: true }),
      onToggleUnderline: () => this.#executeEditorInput({ kind: 'keyDown', key: 'u', ctrlKey: true }),
      onToggleStrikethrough: () =>
        this.#executeEditorInput({ kind: 'keyDown', key: 'x', ctrlKey: true, shiftKey: true }),
      onUndo: () => this.#executeEditorInput({ kind: 'keyDown', key: 'z', ctrlKey: true }),
      onRedo: () => this.#executeEditorInput({ kind: 'keyDown', key: 'z', ctrlKey: true, shiftKey: true }),
    });
    this.#disposeEditKeyboardHandlers = typeof dispose === 'function' ? dispose : null;
  }

  #isCellEditorCursorTarget(properties: CellProperties): boolean {
    return properties.isEdit === true;
  }

  #getFormulaAssistAnchor(): FormulaInputAssistState['anchor'] {
    const rect = this.#lastEditorRect;
    if (!rect) return null;
    const cursor = this.#editSession?.getCursor();
    return this.#coordinates.worldToView(
      cursor
        ? { x: rect.x + cursor.rect.x, y: rect.y + cursor.rect.y + cursor.rect.height }
        : { x: rect.x + 8, y: rect.y + rect.height },
    );
  }

  /**
   * Compute the leftmost X coordinate that center/right-aligned text extends
   * to when it overflows the cell boundary.  Returns `cellLeftX` when there
   * is no leftward overflow.
   *
   * Mirrors the textX formula in TextNode.drawScene to compute the same
   * position the renderer used for the committed cell value.
   */
  #computeOverflowLeftX(
    searCore: SearCoreSheet,
    defaultState: CellEditorSheetFields,
    anchor: [number, number],
    cellLeftX: number,
    baseWidth: number,
    cellPadding: number,
  ): number {
    return computeCellEditorOverflowLeftX(
      readSheetConfig(searCore),
      defaultState,
      this.#textShaper,
      anchor,
      cellLeftX,
      baseWidth,
      cellPadding,
    );
  }

  // ─── Enter edit mode ───────────────────────────────────────────────────

  /** @inheritdoc */
  public onDblClick(searCore: SearCoreSheet, event: EventWithOffsetAndTarget<CellProperties>): boolean {
    if (this.#onFillHandleDoubleClick(event)) return false;
    if (this.#isEditing) return false;
    const offsetX = event.origin?.offsetX;
    const offsetY = event.origin?.offsetY;
    if (typeof offsetX === 'number' || typeof offsetY === 'number') {
      const sheetConfig = readSheetConfig(searCore);
      if (
        (typeof offsetX === 'number' && offsetX < (sheetConfig.sheetOffsetX ?? 50)) ||
        (typeof offsetY === 'number' && offsetY < (sheetConfig.sheetOffsetY ?? 24))
      ) {
        return true;
      }
    }

    const { target } = event;
    if (!target) return true;

    const { region, startRowIndex, startColIndex } = target.properties;
    if (region !== void 0 && region !== CellRegion.Grid) return true;
    if (startRowIndex === void 0 || startColIndex === void 0) return true;
    const row = Number(startRowIndex);
    const col = Number(startColIndex);

    this.#openCellEditor(searCore, row, col, false);
    return false;
  }

  #createEmbeddedEditorContext(
    searCore: SearCoreSheet,
    anchor: Point,
    focus: Point,
    initialDocument: RichDocNode[],
  ): SheetEmbeddedEditorContext {
    const dataEngine = searCore.getDataEngine();
    const geometryState = readCellEditorGeometryFields(dataEngine);
    const resolveRect = () => {
      if (this.#lastEditorRect) return this.#lastEditorRect;
      const rect = geometryState
        ? getSheetRangePositionRect(anchor, focus, {
            rowSizes: geometryState.rowSizes,
            columnSizes: geometryState.columnSizes,
            offsetX: readSheetConfig(searCore).sheetOffsetX ?? 50,
            offsetY: readSheetConfig(searCore).sheetOffsetY ?? 24,
          })
        : null;
      return rect ?? { x: 0, y: 0, width: 0, height: 0 };
    };
    return {
      renderContext: searCore.renderEngine.renderContext,
      isCommandExecuting: () => this.#commands?.isExecuting() === true,
      defaultFontSize: readSheetConfig(searCore).sheetCellFontSize,
      defaultFontFamily: readSheetConfig(searCore).sheetCellFontFamily,
      geometry: {
        get cellRect() {
          return resolveRect();
        },
        get clipRect() {
          return resolveRect();
        },
        toLocalPoint: (point: { x: number; y: number }) => {
          const rect = resolveRect();
          return { x: point.x - rect.x, y: point.y - rect.y };
        },
        toSheetPoint: (point: { x: number; y: number }) => {
          const rect = resolveRect();
          return { x: point.x + rect.x, y: point.y + rect.y };
        },
        containsPoint: (point: { x: number; y: number }) => {
          const rect = resolveRect();
          return (
            point.x >= rect.x && point.y >= rect.y && point.x <= rect.x + rect.width && point.y <= rect.y + rect.height
          );
        },
      },
      documentAccessor: {
        read: () => cloneRichDocument((this.#editSession?.getDocument() ?? initialDocument) as readonly RichDocNode[]),
        commit: (document: readonly RichDocNode[]) => {},
      },
      invalidate: (invalidation) => {
        const rects = invalidation.rects ?? [resolveRect()];
        rects.forEach((rect) =>
          searCore.renderEngine.markDirty(new PositionRect<HexColor>(rect.x, rect.y, rect.width, rect.height)),
        );
      },
    };
  }

  /** @inheritdoc */
  public onMouseDown(searCore: SearCoreSheet, event: EventWithOffsetAndTarget<CellProperties>): boolean | void {
    if (this.#isEditing && event.origin.button === 2) return false;
    // Retained SVG nodes may be replaced between presses, so the browser can
    // omit dblclick even though the second mouse down has detail >= 2.
    if (!this.#isEditing && (event.clickCount ?? event.origin?.clickCount ?? event.origin?.detail ?? 0) >= 2) {
      if (this.onDblClick(searCore, event) === false) {
        event.origin.preventDefault();
        return false;
      }
    }
    const selected = buildSelectionUpdate(searCore, event);
    const pointerInsideEditor = this.#isPointerInsideEditor(searCore, event);
    if (selected) {
      const region = event.target?.properties.region;
      const pickKind: PickedReferenceKind =
        region === CellRegion.RowHeader ? 'row' : region === CellRegion.ColumnHeader ? 'column' : 'cell';
      if (!this.#isEditing && this.#referencePickService?.hasPendingPick()) {
        event.origin.preventDefault();
        this.#crossSheetReferencePick = { start: selected.anchor, end: selected.anchor };
        return false;
      }
      const draft = this.#readFormulaDraft();
      const previousPick = this.#lastPickedReference;
      const replacesPreviousPick = !!(
        draft &&
        previousPick &&
        draft.selectionStart === draft.selectionEnd &&
        draft.selectionEnd === previousPick.start + previousPick.text.length &&
        draft.text.slice(previousPick.start, draft.selectionEnd) === previousPick.text
      );
      if (
        this.#isEditing &&
        draft &&
        !pointerInsideEditor &&
        (canStartFormulaReferencePick(draft.text, draft.selectionStart, draft.selectionEnd) || replacesPreviousPick)
      ) {
        event.origin.preventDefault();
        let start = Math.min(draft.selectionStart, draft.selectionEnd);
        let end = Math.max(draft.selectionStart, draft.selectionEnd);
        let pickStart = selected.anchor;
        if (replacesPreviousPick && previousPick) {
          start = previousPick.start;
          if (event.origin.shiftKey) pickStart = previousPick.cell;
        }
        // A merged-cell click selects its entire rectangle, but references its anchor cell.
        const reference = formatPickedReference(
          pickStart,
          pickKind === 'cell' ? selected.anchor : selected.focus,
          undefined,
          pickKind,
        );
        this.#runCellEditorCommand(searCore, ReplaceFormulaReferenceCommand, {
          reference,
          start,
          end,
          pickStart,
          pickKind,
        });
        this.#textInput.refocus();
        return false;
      }
    }
    if (this.#isEditing) {
      const rect = this.#lastEditorRect;
      if (rect) {
        const scroll = searCore.renderEngine.scrollManager.getState();
        const originEvent = event.origin;
        const pointer = this.#coordinates.viewToWorld({ x: originEvent.offsetX, y: originEvent.offsetY }, scroll);
        const { x: worldX, y: worldY } = pointer;
        if (worldX >= rect.x && worldX <= rect.x + rect.width && worldY >= rect.y && worldY <= rect.y + rect.height) {
          // Prevent the canvas from stealing focus away from the hidden
          // input, which must keep focus for IME composition to work.
          originEvent.preventDefault();
          this.#runCellEditorCommand(searCore, HandleCellEditorPointerCommand, {
            type: 'pointerDown',
            point: pointer,
            clickCount: event.clickCount ?? originEvent.clickCount ?? originEvent.detail ?? 1,
          });
          this.#runCellEditorCommand(searCore, BeginCellEditorDragSelectionCommand, void 0);
          // Refocus hidden input in case preventDefault was insufficient
          // (some browsers may still blur on certain pointer events).
          this.#textInput.refocus();
          return false;
        }
      }
      // Clicked outside editor: exit edit mode, then select new cell
      const { offsetX, offsetY } = event.origin;
      const properties = event.target?.properties;
      const target: CellProperties | null =
        properties?.type === undefined ? null : { ...properties, type: properties.type };
      const point = { x: offsetX, y: offsetY };
      const cursor = this.#cursorRegistry.resolve(target, {
        core: searCore,
        origin: event.origin,
        view: this.#coordinates.viewToWorld(point, { x: 0, y: 0 }),
        world: this.#coordinates.viewToWorld(point),
        target,
      });
      const isResizeHandle = cursor === CursorToken.RowResize || cursor === CursorToken.ColumnResize;
      const selectionUpdate = isResizeHandle
        ? null
        : buildSelectionUpdate(searCore, event, SheetCellEditorPlugin.pluginKey);
      const input = {
        minimumRowHeight: this.#measureMinimumRowHeight(),
        reason: SheetCellEditorExitReason.OutsideClick,
        pipelineName: SheetCellEditorPipelineName.EditExitAndSelect,
      } satisfies SheetCommitCellEditInput;
      this.#runCellEditorCommand(
        searCore,
        CommitCellEditCommand,
        selectionUpdate ? { ...input, nextSelection: selectionUpdate } : input,
      );
      if (!this.#isEditing) this.#commands!.run(RestartSheetSelectionNavigationCommand, undefined);
      else {
        event.origin.preventDefault();
        this.#textInput.refocus();
      }
      return isResizeHandle && !this.#isEditing ? void 0 : false;
    }
  }

  #isPointerInsideEditor(searCore: SearCoreSheet, event: EventWithOffsetAndTarget<CellProperties>): boolean {
    const rect = this.#lastEditorRect;
    if (!this.#isEditing || !rect) return false;
    const scroll = searCore.renderEngine.scrollManager.getState();
    const pointer = this.#coordinates.viewToWorld({ x: event.origin.offsetX, y: event.origin.offsetY }, scroll);
    return (
      pointer.x >= rect.x &&
      pointer.x <= rect.x + rect.width &&
      pointer.y >= rect.y &&
      pointer.y <= rect.y + rect.height
    );
  }

  // ─── Drag-to-select ────────────────────────────────────────────────────

  /** @inheritdoc */
  public onMouseMove(searCore: SearCoreSheet, event: EventWithOffsetAndTarget<CellProperties>): boolean | void {
    if (this.#crossSheetReferencePick) {
      const selected = buildSelectionUpdate(searCore, event);
      if (selected) this.#crossSheetReferencePick.end = selected.focus;
      return false;
    }
    if (this.#referencePick) {
      const selected = buildSelectionUpdate(searCore, event);
      if (selected) {
        const reference = formatPickedReference(
          this.#referencePick.start,
          selected.focus,
          undefined,
          this.#referencePick.kind,
        );
        this.#runCellEditorCommand(searCore, ReplaceFormulaReferenceCommand, {
          reference,
          start: this.#referencePick.replaceStart,
          end: this.#referencePick.replaceEnd,
        });
      }
      return false;
    }
    if (!this.#isEditing || !this.#isDragSelecting) return;
    const rect = this.#lastEditorRect;
    if (!rect || !this.#editSession) return false;

    const scroll = searCore.renderEngine.scrollManager.getState();
    const originEvent = event.origin;

    // Clamp world coords to editor bounds so dragging past the edge
    // snaps the selection head to the nearest text position.
    const pointer = this.#coordinates.viewToWorld({ x: originEvent.offsetX, y: originEvent.offsetY }, scroll);
    const worldX = Math.max(rect.x, Math.min(rect.x + rect.width, pointer.x));
    const worldY = Math.max(rect.y, Math.min(rect.y + rect.height, pointer.y));
    this.#runCellEditorCommand(searCore, HandleCellEditorPointerCommand, {
      type: 'pointerMove',
      point: { x: worldX, y: worldY },
    });

    // Prevent SheetSelectionPlugin from modifying the sheet selection
    // while the user is dragging inside the cell editor.
    return false;
  }

  #handleEditorPointer(input: SheetCellEditorPointerInput): void {
    if (!this.#editSession) return;
    const update = this.#editSession.handlePointer({
      type: input.type,
      point: input.point,
      ...(input.type === 'pointerDown' ? { clickCount: input.clickCount ?? 1 } : { buttons: 1 }),
    });
    if (update.selection) this.#commands!.run(SynchronizeCellEditModelCommand, undefined);
    this.#requestRerender();
  }

  #beginDragSelection(): void {
    if (!this.#isEditing) return;
    const core = this.#resolveCore();
    this.#isDragSelecting = true;
    this.#disposePointerCapture?.();
    this.#disposePointerCapture = this.#pointerCapture.start({
      onRelease: () => this.#runCellEditorCommand(core, EndCellEditorDragSelectionCommand, { disposeCapture: false }),
    });
  }

  #endDragSelection(disposeCapture: boolean): void {
    this.#isDragSelecting = false;
    if (disposeCapture) this.#disposePointerCapture?.();
    this.#disposePointerCapture = null;
  }

  /** @inheritdoc */
  public onMouseUp(_searCore: SearCoreSheet, event: EventWithOffsetAndTarget<CellProperties>): boolean | void {
    if (this.#crossSheetReferencePick) {
      const pick = this.#crossSheetReferencePick;
      this.#crossSheetReferencePick = null;
      const selected = buildSelectionUpdate(_searCore, event);
      this.#referencePickService?.pick(pick.start, selected?.focus ?? pick.end);
      return false;
    }
    if (this.#referencePick) {
      this.#runCellEditorCommand(_searCore, EndFormulaReferencePickCommand, void 0);
      return false;
    }
    if (!this.#isEditing && event.target) {
      this.#textInput.startListener();
      this.#textInput.refocus();
    }
    if (!this.#isEditing || !this.#isDragSelecting) return;
    this.#runCellEditorCommand(_searCore, EndCellEditorDragSelectionCommand, { disposeCapture: true });
    return false;
  }

  /** Registers visual defaults for the inline cell editor. */
  public override registerConfig() {
    return [
      {
        key: this.key,
        config: new ConfigUnit(SheetCellEditorView.defaultConfig),
      },
    ];
  }

  /** Renders SheetCellEditorView scene output. */
  public render(
    searCore: SearCoreSheet,
    offset: { x: number; y: number } = {
      x: readSheetConfig(searCore).sheetOffsetX ?? 50,
      y: readSheetConfig(searCore).sheetOffsetY ?? 24,
    },
  ): Node<CellProperties>[] {
    const dataEngine = searCore.getDataEngine();
    const editorState = dataEngine.getDataType<EditorState>(SheetCellEditorPlugin.pluginKey);
    if (!editorState) return [];
    if (editorState[1].shape.join('') === RectRange.Empty.join('')) return [];

    const defaultState = readCellEditorSheetFields(dataEngine);
    if (!defaultState) return [];
    const { rowSizes, columnSizes } = defaultState;

    const anchor = editorState[1].getPoint(0);
    const focus = editorState[1].getPoint(1);

    const rangeRect = getSheetRangePositionRect(anchor, focus, {
      rowSizes,
      columnSizes,
      offsetX: offset.x,
      offsetY: offset.y,
    });
    if (!rangeRect) return [];
    const scrollState = searCore.renderEngine.scrollManager.getState();
    const fixedRows = readSheetFixedRows(dataEngine);
    const fixedY =
      fixedRows && anchor[0] === focus[0]
        ? activeFixedRowOffsets(fixedRows, rowSizes, scrollState.y, readSheetFreeze(dataEngine).rows, offset.y).get(
            anchor[0],
          )
        : undefined;
    const { x: startX, width: baseWidth, height: baseHeight } = rangeRect;
    const startY = fixedY ?? rangeRect.y;
    const cellPadding = readSheetConfig(searCore).cellPadding ?? 4;

    const editorText = this.#session.pendingDoc.map(paraText).join('\n');
    const cursorOffset = getDocumentOffset(this.#session.pendingDoc, this.#session.docSelection.head);
    const highlighting = this.#highlighter.highlight(editorText, {
      cursorOffset,
    });
    const lineCount = editorText.split('\n').length;
    const sheetConfig = readSheetConfig(searCore);
    const fontSize = sheetConfig.sheetCellFontSize ?? 10;
    // The embedded Doc editor uses 12px by default even when Sheet cells use 10px.
    const font = createFontDescriptor({
      fontSize: Math.max(fontSize, 12),
      fontFamily: sheetConfig.sheetCellFontFamily ?? 'Inter, ui-sans-serif, system-ui, sans-serif',
    });
    const textWidth = this.#textShaper
      ? Math.max(...editorText.split('\n').map((line) => this.#textShaper!.shape({ text: line, font }).width))
      : 0;
    const viewportWidth = searCore.renderEngine.scrollManager.getShape()[0];
    const viewportLeft = scrollState.x + offset.x;
    const viewportRight = scrollState.x + viewportWidth - 8;
    const editorWidth = Math.max(
      baseWidth,
      Math.min(Math.ceil(textWidth + cellPadding * 2 + 8), viewportRight - viewportLeft),
    );
    const editorX =
      editorWidth > baseWidth && startX >= viewportLeft && startX < viewportRight
        ? Math.max(viewportLeft, Math.min(startX, viewportRight - editorWidth))
        : startX;
    const expandedHeight = lineCount > 1 ? Math.ceil(lineCount * fontSize * 1.5 + cellPadding * 2) : baseHeight;
    const editorHeight = Math.max(baseHeight, expandedHeight);
    const nextRow = focus[0] + 1;
    const previousRow = anchor[0] - 1;
    const expandUpward =
      editorHeight > baseHeight &&
      previousRow >= 0 &&
      nextRow < defaultState.sheetData.shape[0] &&
      defaultState.sheetData.getItem(nextRow, anchor[1]) !== null &&
      defaultState.sheetData.getItem(previousRow, anchor[1]) === null &&
      startY - (editorHeight - baseHeight) >= offset.y;
    const preferredY = expandUpward ? startY + baseHeight - editorHeight : startY;
    const viewportOffsetY = fixedY === undefined ? scrollState.y : 0;
    const viewportTop = viewportOffsetY + offset.y;
    const viewportBottom = viewportOffsetY + searCore.renderEngine.scrollManager.getShape()[1] - 8;
    const editorY =
      editorHeight > baseHeight &&
      startY >= viewportTop &&
      startY < viewportBottom &&
      editorHeight <= viewportBottom - viewportTop
        ? Math.max(viewportTop, Math.min(preferredY, viewportBottom - editorHeight))
        : preferredY;
    const positionRect = {
      x: editorX,
      y: editorY,
      width: editorWidth,
      height: editorHeight,
    };
    const cursor = this.#editSession?.getCursor();

    // Position hidden input at cursor screen coords so the OS IME candidate
    // window is anchored near the cell being edited.
    if (cursor) {
      this.#textInput.setPosition(
        positionRect.x + cursor.rect.x - scrollState.x,
        positionRect.y + cursor.rect.y - (fixedY === undefined ? scrollState.y : 0),
      );
    }

    // ── Dirty-region management ───────────────────────────────────────────
    // Compute leftward overflow for center/right-aligned cells.
    // The overflow area must be a SEPARATE dirty rect from the editor/cell
    // rect: if we extended the editor's dirty rect to cover the overflow,
    // DirtyRenderStrategy would find the grid cell's FixBoxNode intersecting
    // the extended rect and redraw the TextNode, re-painting the overflow
    // text we just cleared.  A separate rect that stops 1 px short of the
    // cell's left edge does not intersect the grid cell, so the overflow
    // area is cleared without the grid cell redrawing there.
    const cellLeftX = startX;
    const overflowLeftX = this.#computeOverflowLeftX(searCore, defaultState, anchor, cellLeftX, baseWidth, cellPadding);
    this.#lastOverflowLeftX = overflowLeftX < cellLeftX ? overflowLeftX : null;

    const STROKE = 2;
    const prev = this.#lastEditorRect;
    const left = (prev ? Math.min(prev.x, positionRect.x) : positionRect.x) - STROKE;
    const top = (prev ? Math.min(prev.y, positionRect.y) : positionRect.y) - STROKE;
    const right =
      (prev
        ? Math.max(prev.x + prev.width, positionRect.x + positionRect.width)
        : positionRect.x + positionRect.width) + STROKE;
    const bottom =
      (prev
        ? Math.max(prev.y + prev.height, positionRect.y + positionRect.height)
        : positionRect.y + positionRect.height) + STROKE;
    searCore.renderEngine.markDirty(new PositionRect<HexColor>(left, top, right - left, bottom - top));

    // Mark overflow area as a separate dirty rect (1 px inset so it does not
    // touch the grid cell's left edge and trigger a redraw there).
    if (this.#lastOverflowLeftX !== null) {
      const overflowWidth = cellLeftX - this.#lastOverflowLeftX - 1;
      if (overflowWidth > 0) {
        searCore.renderEngine.markDirty(
          new PositionRect<HexColor>(this.#lastOverflowLeftX, top, overflowWidth, bottom - top),
        );
      }
    }

    this.#lastEditorRect = { ...positionRect };
    if (
      this.#formulaAssistState.suggestions.length ||
      this.#formulaAssistState.signature ||
      this.#formulaAssistState.diagnostic
    ) {
      const anchor = this.#getFormulaAssistAnchor();
      const previous = this.#formulaAssistState.anchor;
      if (anchor && (!previous || previous.x !== anchor.x || previous.y !== anchor.y)) {
        this.#getCommandBus(searCore)?.run(UpdateFormulaAssistAnchorCommand, anchor);
      }
    }

    // ── Create editor cell node ───────────────────────────────────────────
    const { renderCoordinatorManager } = searCore.renderEngine;
    const pluginConfig =
      searCore.configEngine.getConfig?.<SheetCellEditorConfig>(this.key) ?? SheetCellEditorView.defaultConfig;
    const cell = renderCoordinatorManager.create({ type: EmptyCell.symbol }, positionRect, {
      type: EmptyCell.symbol,
      isEdit: true,
      fill: pluginConfig.editorBackgroundColor,
      strokeWidth: 2,
      stroke: EDITOR_BORDER_COLOR,
      depth: this.depth + 5,
      skipHit: true,
    });
    const nodes = cell?.render();
    const editorNodes = nodes ? [nodes].flat() : [];
    const docOverlayNodes =
      editorNodes.length > 0 && this.#editSession
        ? [
            new EmbeddedEditorRenderNode<CellProperties>(
              this.#session.pendingDoc,
              positionRect,
              { type: EmptyCell.symbol, isEdit: true, depth: this.depth + 6 },
              this.#editSession,
              { cursorVisible: this.#blinker.visible },
            ),
          ]
        : [];
    if (fixedY !== undefined) {
      [...editorNodes, ...docOverlayNodes].forEach((node) => node.setStickyTree(true, { top: positionRect.y }));
    }
    // Keep reference outlines inside their cells so adjacent references do
    // not paint over one another along a shared grid boundary.
    const referenceHighlightInset = 0.5;
    const referenceNodes = highlighting.cellRanges.flatMap((reference) => {
      const bounds = resolveReferenceHighlightBounds(reference, {
        rowCount: rowSizes.shape[1],
        colCount: columnSizes.shape[1],
      });
      if (!bounds) return [];
      const referenceRect = getSheetRangePositionRect(bounds.start, bounds.end, {
        rowSizes,
        columnSizes,
        offsetX: offset.x,
        offsetY: offset.y,
      });
      if (!referenceRect) return [];
      const referenceCell = renderCoordinatorManager.create(
        { type: EmptyCell.symbol },
        {
          x: referenceRect.x + referenceHighlightInset,
          y: referenceRect.y + referenceHighlightInset,
          width: Math.max(0, referenceRect.width - referenceHighlightInset * 2),
          height: Math.max(0, referenceRect.height - referenceHighlightInset * 2),
        },
        {
          type: EmptyCell.symbol,
          strokeWidth: 1,
          stroke: reference.color,
          fill: reference.fill,
          depth: this.depth + 4,
          skipHit: true,
        },
      );
      const nodes = referenceCell?.render();
      const overlayNodes = nodes ? [nodes].flat() : [];
      // Reference highlights are stroke/fill overlays only. Mark them as
      // edit-layer nodes after rendering so EmptyCell does not mount editable
      // text content for these reference ranges.
      overlayNodes.forEach((node) => {
        (node.properties as Record<string, unknown>)['isEdit'] = true;
      });
      return overlayNodes;
    });
    return [...referenceNodes, ...editorNodes, ...docOverlayNodes];
  }
}

function readSheetConfig(searCore: SearCoreSheet): Partial<SheetConfig> {
  return searCore.configEngine.getDefaultConfig() as Partial<SheetConfig>;
}

export interface SheetCellEditorViewOptions {
  readonly merges: SheetCellMergePlugin;
  readonly selection: SheetSelectionPlugin;
  /** Lets the selection presentation consume a fill gesture before cell editing. */
  readonly onFillHandleDoubleClick: (event: EventWithOffsetAndTarget<CellProperties>) => boolean;
  readonly textInput: TextInput;
  readonly keyboard: KeyboardRouter;
  readonly pointer: PointerCapture;
  readonly cursors: CursorRegistry;
  readonly cursor: CursorEngine;
  readonly platform: Platform;
  readonly highlighter: Highlighter;
  readonly coordinates: CoordinateTransformer;
  readonly embeddedEditor: SheetEmbeddedEditor;
  readonly textShaper: TextShaper;
  readonly commands: SheetCommandBus;
  readonly references?: FormulaReferencePickService | undefined;
}
