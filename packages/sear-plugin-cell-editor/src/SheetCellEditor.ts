import { buildSelectionUpdate, readCellEditorGeometryFields, resolveReferenceHighlightBounds } from './SheetCellEditorGeometry';
import { IsCellEditingQuery } from './IsCellEditingQuery';
import { ReadSelectedCellEditTextQuery } from './ReadSelectedCellEditTextQuery';
import { SearError } from '@searsuite/sear-foundation-error';
import { columnIndexToLabel } from '@searsuite/sear-foundation-utils';
import {
  SearCoreSheet,
  CellMatrixElement,
  SheetMatrix,
  Pipeline,
  SheetInteractionReducerRegistry,
  runOutsideCommandExecution,
} from '@searsuite/sear-assembly-core';
import {
  RectOT,
  RectOTActionName,
  MatrixOTActionName,
  createUpdateRectOTOperation,
  createUpdateCellOTOperation,
  createResizeRowOTOperation,
} from '@searsuite/sear-domain-ot';
import { DocCursorDirection } from '@searsuite/sear-domain-commands';
import { Plugin, PluginKey } from '@searsuite/sear-assembly-plugin';
import { EventWithOffsetAndTarget } from '@searsuite/sear-render-event-engine';
import {
  PositionRect,
  Rect as RectRange,
  Point,
  createEmptyRect,
  createEmptyRectShape,
} from '@searsuite/sear-foundation-rect';
import { Inject, Injectable, type Container } from '@searsuite/sear-foundation-di';
import { Transaction } from '@searsuite/sear-domain-transaction';
import { ConfigUnit, type SheetConfig } from '@searsuite/sear-assembly-config';
import {
  createSheetTransaction,
  TransactionPipelineCommand,
  LocalActionCommand,
  PipelineExecutionCommand,
  SheetCommandBus,
  SheetQueryRegistry,
  SelectionMoveDirection,
  type SheetCommandDefinition,
  type SheetCommandResult,
} from '@searsuite/sear-assembly-commands';
import { Node } from '@searsuite/sear-render-node';
import { readSheetCellAlignments } from '@searsuite/sear-plugin-alignment';
import { CoordinateTransformer } from '@searsuite/sear-render-context';
import { createFontDescriptor, TextShaper } from '@searsuite/sear-render-metrics';
import { activeFixedRowOffsets, getSheetRangePositionRect } from '@searsuite/sear-render';
import { SheetCellMergePlugin } from '@searsuite/sear-plugin-cell-merge';
import { readSheetFixedRows } from '@searsuite/sear-plugin-fixed-row';
import { readSheetFreeze } from '@searsuite/sear-plugin-freeze';
import {
  createSetRangeCellFormatOperations,
  readSheetCellFormats,
  SheetCellFormatPlugin,
  type CellFormatMatrix,
} from '@searsuite/sear-plugin-cell-format';
import {
  SheetHighlightPipelineStepName,
  SheetHighlightPlugin,
  SheetSelectionInteractionName,
  SheetSelectionPipelineStepName,
  SheetSelectionPlugin,
  SheetSelectionSource,
  EnsureSelectionVisibleCommand,
  GetActiveCell,
  GetSelections,
} from '@searsuite/sear-plugin-selection';
import { type DataEngine, readSheetDataMatrix, readSheetRowVisibility, SheetDataPlugin } from '@searsuite/sear-render-engine';
import { readSheetRowSizes, SheetResizePlugin } from '@searsuite/sear-plugin-resize';
import { type CSRMatrix, type DimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import { CellProperties, CellRegion, EmptyCell, EmbeddedEditorRenderNode } from '@searsuite/sear-render-registry';
import {
  TextInput,
  TextInputKind,
  type TextInputEvent,
  KeyboardRouter,
  PointerCapture,
} from '@searsuite/sear-render-input';
import { HexColor } from '@searsuite/sear-foundation-utils';
import {
  FormulaDateSystem,
  IFormulaParser,
  IFormulaSourceProvider,
  IFormulaDateSystemProvider,
  type IFunctionRegistry,
} from '@searsuite/sear-domain-formula-engine';
import { type ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { SheetFormulaBarObservation, type SheetFormulaBarState } from './SheetFormulaBarObservation';
import { CursorRegistry, CursorEngine, CursorToken } from '@searsuite/sear-render-cursor';
import {
  RichDocNode,
  DocSelection,
  getTextNodeLength,
  normalizeDocForEdit,
  stringToRichDoc,
  isDocSemanticallyEmpty,
  paraText,
  getDocumentOffset,
  cloneRichDocument,
} from '@searsuite/sear-domain-doc';
import {
  SheetEmbeddedEditor,
  type SheetEditSession,
  type SheetEmbeddedEditorContext,
  type SheetTextSelection,
} from '@searsuite/sear-sheet-editor-contract';
import { EditorState, EDITOR_BORDER_COLOR } from './EditorTypes';
import { EditorCursorBlinker } from './EditorCursorBlinker';
import { Platform } from '@searsuite/sear-foundation-platform';
import {
  CellClipboardCodecRegistry,
  CellCommitStrategyRegistry,
  CellFormats,
  CellType,
  formatCellNumberForEditor,
  formatCellNumberForFormulaBar,
  ICellFormatLocaleProvider,
  SheetCellInputValidationRegistry,
} from '@searsuite/sear-domain-cell-types';
import { getCellEditableValue } from './CellEditableValue';
import { computeCellEditorOverflowLeftX } from './computeCellEditorOverflowLeftX';
import { registerSheetRangeTextStyleCommand } from './SheetRangeTextStyleCommand';
import { Highlighter } from './Highlighter';
import {
  SheetCellEditorExitReason,
  SheetCellEditorInteractionName,
  SheetCellEditorKind,
  SheetCellEditorPipelineName,
  SheetCellEditorPipelineStepName,
} from './SheetCellEditorPipelineNames';
import { registerSheetCellEditorInteractionReducers } from './SheetCellEditorInteractionReducer';
import {
  BeginCellEditCommand,
  OpenCellEditorCommand,
  CancelCellEditCommand,
  CommitCellEditCommand,
  InsertCurrentDateTimeCommand,
  HandleDocumentInputCommand,
  HandleCellEditorPointerCommand,
  BeginCellEditorDragSelectionCommand,
  EndCellEditorDragSelectionCommand,
  ReplaceFormulaReferenceCommand,
  EndFormulaReferencePickCommand,
  RequestCellEditorRenderCommand,
  UpdateCellEditorDocumentSelectionCommand,
  SetCellInlineStyleCommand,
  AcceptFormulaSuggestionCommand,
  MoveFormulaSuggestionCommand,
  UpdateFormulaAssistAnchorCommand,
  CycleFormulaReferenceCommand,
  RestoreFormulaEditDraftCommand,
  StartFormulaBarEditCommand,
  SetFormulaBarDraftCommand,
  HandleFormulaBarKeyCommand,
  type SheetBeginCellEditInput,
  type SheetOpenCellEditorInput,
  type SheetCancelCellEditInput,
  type SheetCommitCellEditInput,
  type SheetDocumentInputCommandInput,
  type SheetCellEditorPointerInput,
  type SheetFormulaReferenceReplacementInput,
  type SheetDocumentSelectionCommandInput,
  type SheetInlineStyleCommandInput,
  type FormulaSuggestionMove,
} from './SheetCellEditorCommands';
import { analyzeFormulaInput, type FormulaInputAnalysis } from './formulaAssist/FormulaInputAnalysis';
import {
  FormulaInputAssistObservation,
  type FormulaInputAssistState,
} from './formulaAssist/FormulaInputAssistObservation';
import { cloneFormulaInputAssistState } from './formulaAssist/cloneFormulaInputAssistState';
import { formulaDocumentPosition } from './formulaAssist/formulaDocumentPosition';
import { FormulaReferencePickService, type FormulaEditDraft } from './formulaAssist/FormulaReferencePick';
import { ReadFormulaEditDraftQuery } from './formulaAssist/ReadFormulaEditDraftQuery';
import {
  canPickFormulaReference,
  canStartFormulaReferencePick,
  formatPickedReference,
  type PickedReferenceKind,
} from './formulaAssist/formatPickedReference';
import { completeFormulaForCommit } from './formulaAssist/completeFormulaForCommit';
import { FormulaAutoCloseTracker } from './formulaAssist/FormulaAutoCloseTracker';
import { cycleFormulaReference } from './formulaAssist/cycleFormulaReference';
import { diagnoseFormulaInput } from './formulaAssist/diagnoseFormulaInput';

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
export class SheetCellEditorPlugin extends Plugin<SearCoreSheet, CellProperties, EditorState> {
  readonly #mergePlugin: SheetCellMergePlugin;
  readonly #selectionPlugin: SheetSelectionPlugin;
  readonly #textInput: TextInput;
  readonly #keyboardRouter: KeyboardRouter;
  readonly #pointerCapture: PointerCapture;
  readonly #cursorRegistry: CursorRegistry;
  readonly #cursorEngine: CursorEngine;
  readonly #platform: Platform;
  readonly #commitStrategies: CellCommitStrategyRegistry;
  readonly #highlighter: Highlighter;
  readonly #coordinates: CoordinateTransformer;
  readonly #formulaSourceProvider: IFormulaSourceProvider | undefined;
  readonly #cellFormatLocaleProvider: ICellFormatLocaleProvider | undefined;
  readonly #queries: SheetQueryRegistry | undefined;
  readonly #formulaParser: IFormulaParser | undefined;
  readonly #inputValidation: SheetCellInputValidationRegistry | undefined;
  readonly #dateSystemProvider: IFormulaDateSystemProvider | undefined;
  readonly #cellCodecs: CellClipboardCodecRegistry | undefined;

  /** DI token for resolving SheetCellEditorPlugin. */
  public static readonly symbol: symbol = Symbol.for('SheetCellEditorPlugin');
  /** Stable plugin key for SheetCellEditorPlugin. */
  public static readonly pluginKey = key;
  /** Default visual configuration for the inline cell editor. */
  public static readonly defaultConfig: SheetCellEditorConfig = {
    editorBackgroundColor: '#ffffff',
  };

  /** Registers rich-document node types used by the sheet cell editor. */
  public static registerServices(_context: { readonly container: Container }): void {}

  // ─── Editing session state ─────────────────────────────────────────────

  #isEditing: boolean = false;
  #boundaryCommitSequence = 0;

  /** True while the user is holding the mouse button and dragging to extend the text selection. */
  #isDragSelecting: boolean = false;
  #disposePointerCapture: (() => void) | null = null;

  // ─── Embedded editor session ───────────────────────────────────────────

  #editSession: SheetEditSession | null = null;
  #initialEditSnapshot: string | null = null;
  #disposeEditKeyboardHandlers: (() => void) | null = null;
  readonly #embeddedEditor: SheetEmbeddedEditor | undefined;
  #embeddedContext: SheetEmbeddedEditorContext | null = null;
  #sessionState: {
    pendingDoc: RichDocNode[];
    docSelection: DocSelection;
    preferredX: number | null;
    lastSnapshot: null;
  } = {
    pendingDoc: [],
    docSelection: { anchor: { path: [0, 0], offset: 0 }, head: { path: [0, 0], offset: 0 } },
    preferredX: null,
    lastSnapshot: null,
  };

  get #session() {
    return this.#sessionState;
  }

  /** Returns the active document selection for host diagnostics and adapters. */
  public getDocumentSelection(): DocSelection {
    const { anchor, head } = this.#session.docSelection;
    return {
      anchor: { path: [...anchor.path], offset: anchor.offset },
      head: { path: [...head.path], offset: head.offset },
    };
  }

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
  #functionRegistry: IFunctionRegistry | null = null;
  #formulaAnalysis: FormulaInputAnalysis | null = null;
  #referencePickService: FormulaReferencePickService | undefined;
  #referencePickBindingClosed = false;
  #formulaAssistState: FormulaInputAssistState = {
    suggestions: [],
    selectedIndex: 0,
    signature: null,
    diagnostic: null,
    anchor: null,
  };
  readonly #formulaAssistListeners = new Set<(state: FormulaInputAssistState) => void>();
  readonly #formulaBarListeners = new Set<(state: SheetFormulaBarState) => void>();
  #referencePick: { readonly start: Point; readonly kind: PickedReferenceKind; readonly replaceStart: number; replaceEnd: number } | null = null;
  #crossSheetReferencePick: { readonly start: Point; end: Point } | null = null;
  #lastPickedReference: { readonly start: number; readonly text: string; readonly cell: Point } | null = null;
  readonly #formulaAutoClose = new FormulaAutoCloseTracker();
  // ─── Dependencies ─────────────────────────────────────────────────────

  readonly #blinker: EditorCursorBlinker;
  #commands: SheetCommandBus | undefined;
  /** @inheritdoc */
  public override interestedIn: string[] = [];

  /** Creates a SheetCellEditorPlugin instance. */
  constructor(
    @Inject(SheetCellMergePlugin.symbol)
    mergePlugin: SheetCellMergePlugin,
    @Inject(SheetSelectionPlugin.symbol)
    selectionPlugin: SheetSelectionPlugin,
    @Inject(TextInput.symbol) textInput: TextInput,
    @Inject(KeyboardRouter.symbol)
    keyboardRouter: KeyboardRouter,
    @Inject(PointerCapture.symbol)
    pointerCapture: PointerCapture,
    @Inject(CursorRegistry.symbol) cursorRegistry: CursorRegistry,
    @Inject(CursorEngine.symbol) cursorEngine: CursorEngine,
    @Inject(Platform.symbol) platform: Platform,
    @Inject(CellCommitStrategyRegistry.symbol)
    commitStrategies: CellCommitStrategyRegistry,
    @Inject(Highlighter.symbol) highlighter: Highlighter,
    @Inject(CoordinateTransformer.symbol)
    coordinates: CoordinateTransformer,
    @Inject(SheetInteractionReducerRegistry.symbol)
    interactionReducers: SheetInteractionReducerRegistry,
    @Inject(SheetEmbeddedEditor.symbol)
    embeddedEditor?: unknown,
    @Inject(SheetCommandBus.symbol)
    commands?: SheetCommandBus,
    @Inject(IFormulaSourceProvider.symbol)
    formulaSourceProvider?: IFormulaSourceProvider,
    @Inject(TextShaper.symbol) textShaper?: TextShaper,
    @Inject(ICellFormatLocaleProvider.symbol)
    cellFormatLocaleProvider?: ICellFormatLocaleProvider,
    @Inject(SheetQueryRegistry.symbol)
    queries?: SheetQueryRegistry,
    @Inject(IFormulaParser.symbol)
    formulaParser?: IFormulaParser,
    @Inject(SheetCellInputValidationRegistry.symbol)
    inputValidation?: SheetCellInputValidationRegistry,
    @Inject(IFormulaDateSystemProvider.symbol)
    dateSystemProvider?: IFormulaDateSystemProvider,
    @Inject(CellClipboardCodecRegistry.symbol)
    cellCodecs?: CellClipboardCodecRegistry,
  ) {
    super({
      key,
      state: [createEmptyRect(), createEmptyRect(), createEmptyRect()],
    });
    this.#mergePlugin = mergePlugin;
    this.#selectionPlugin = selectionPlugin;
    this.#textInput = textInput;
    this.#keyboardRouter = keyboardRouter;
    this.#pointerCapture = pointerCapture;
    this.#cursorRegistry = cursorRegistry;
    this.#cursorEngine = cursorEngine;
    this.#platform = platform;
    this.#commitStrategies = commitStrategies;
    this.#highlighter = highlighter;
    this.#coordinates = coordinates;
    this.#formulaSourceProvider = formulaSourceProvider;
    this.#cellFormatLocaleProvider = cellFormatLocaleProvider;
    this.#queries = queries;
    this.#formulaParser = formulaParser;
    this.#inputValidation = inputValidation;
    this.#dateSystemProvider = dateSystemProvider;
    this.#cellCodecs = cellCodecs;

    this.#commands = commands;
    this.#embeddedEditor = isSheetEmbeddedEditor(embeddedEditor) ? embeddedEditor : undefined;

    this.#blinker = new EditorCursorBlinker(this.#platform, () => this.#requestRerender());
    registerSheetCellEditorInteractionReducers(interactionReducers);

    this.#cursorRegistry.register({
      kind: 'predicate',
      priority: 'high',
      test: this.#isCellEditorCursorTarget.bind(this),
      cursor: 'text',
    });

    this.#textShaper = textShaper;

    // TextInput handles IME composition and printable character input only.
    this.#textInput.subscribe({
      onTextInput: this.#handleEditorTextInput.bind(this),
      onDelete: this.#handleEditorTextDelete.bind(this), // clipboard Cut
      onCut: () => this.#readSelectedCellEditText(),
    });
    this.#keyboardRouter.subscribe({
      onEdit: this.#handleStartEditingKey.bind(this),
      onInsertCurrentDate: () => this.#insertCurrentDateTime('date'),
      onInsertCurrentTime: () => this.#insertCurrentDateTime('time'),
    });
  }

  /** Binds this plugin to the core owned by its editor-local container. */
  public bindCore(core: SearCoreSheet): void {
    if (this.#core && this.#core !== core) {
      throw new SearError('Sheet cell editor core is already bound to an editor.');
    }
    this.#core = core;
  }

  /** Binds the editor-local registry after formula services have been assembled. */
  public bindFormulaRegistry(registry: IFunctionRegistry): void {
    if (this.#functionRegistry && this.#functionRegistry !== registry) {
      throw new SearError('Sheet cell editor formula registry is already bound to an editor.');
    }
    this.#functionRegistry = registry;
  }

  /** Binds the optional parent-workbook reference picker. */
  public bindReferencePickService(service: FormulaReferencePickService): void {
    if (this.#referencePickBindingClosed && this.#referencePickService !== service) {
      throw new SearError('Sheet cell editor reference picker cannot be bound after command registration.');
    }
    if (this.#referencePickService && this.#referencePickService !== service) {
      throw new SearError('Sheet cell editor reference picker is already bound to an editor.');
    }
    this.#referencePickService = service;
  }

  /** Publishes formula authoring state through the editor's typed observation registry. */
  public registerObservations(observations: ObservationRegistry): void {
    observations.register(FormulaInputAssistObservation, {
      getSnapshot: () => cloneFormulaInputAssistState(this.#formulaAssistState),
      subscribe: (listener) => {
        this.#formulaAssistListeners.add(listener);
        return () => this.#formulaAssistListeners.delete(listener);
      },
    });
    observations.register(SheetFormulaBarObservation, {
      getSnapshot: () => this.#readFormulaBarState(),
      subscribe: (listener) => {
        this.#formulaBarListeners.add(listener);
        return () => this.#formulaBarListeners.delete(listener);
      },
    });
  }

  #readFormulaBarState(): SheetFormulaBarState {
    const selection = this.#selectionPlugin.getState();
    const activeCell = selection[0].getPoint(0);
    const merged =
      activeCell[0] >= 0 && activeCell[1] >= 0 ? this.#mergePlugin.isMergedCell(activeCell[0], activeCell[1]) : null;
    const cell = merged ? merged.getPoint(0) : activeCell;
    if (cell[0] < 0 || cell[1] < 0) {
      return { cell: null, range: null, text: '', editing: false, selectionStart: 0, selectionEnd: 0 };
    }
    const rangeStart = selection[1].getPoint(0);
    const rangeEnd = selection[1].getPoint(1);
    const range =
      rangeStart[0] < 0
        ? null
        : {
            start: [...rangeStart] as Point,
            end: [...rangeEnd] as Point,
          };
    const editDocument = this.#isEditing ? (this.#editSession?.getDocument() as RichDocNode[] | undefined) : undefined;
    const editSelection = editDocument ? this.#editSession?.getSelection() : null;
    if (editDocument) {
      const text = editDocument.map(paraText).join('\n');
      return {
        cell: [...cell] as Point,
        range,
        text,
        editing: true,
        selectionStart: editSelection
          ? getDocumentOffset(editDocument, editSelection.anchor as DocSelection['anchor'])
          : text.length,
        selectionEnd: editSelection
          ? getDocumentOffset(editDocument, editSelection.head as DocSelection['head'])
          : text.length,
      };
    }
    const dataEngine = this.#core?.getDataEngine();
    const stored = dataEngine ? readSheetDataMatrix(dataEngine)?.getItem(cell[0], cell[1]) : null;
    const value = getCellEditableValue(stored, { row: cell[0], col: cell[1] }, this.#formulaSourceProvider);
    const text = Array.isArray(value)
      ? (value as RichDocNode[]).map(paraText).join('\n')
      : stored?.type === CellType.Number && typeof value === 'number'
      ? formatCellNumberForFormulaBar(
          value,
          dataEngine ? readSheetCellFormats(dataEngine)?.getItem(cell[0], cell[1]) : null,
          this.#cellFormatLocaleProvider?.getCellFormatLocale(),
        )
      : typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : '';
    return { cell: [...cell] as Point, range, text, editing: false, selectionStart: 0, selectionEnd: 0 };
  }

  #publishFormulaBarState(): void {
    if (!this.#formulaBarListeners?.size) return;
    const state = this.#readFormulaBarState();
    runOutsideCommandExecution(() =>
      this.#formulaBarListeners.forEach((listener) => {
        try {
          listener(state);
        } catch (error) {
          this.#platform.warn('Formula bar listener failed.', error);
        }
      }),
    );
  }

  /** Explicitly binds services for isolated plugin tests or custom local assembly. */
  public bindRuntimeServices(container: Container): void {
    if (Plugin.prototype.hasStateWriteBoundary.call(this)) {
      throw new SearError('Sheet cell editor runtime services cannot be rebound after assembly.');
    }
    const core = resolveOptional<SearCoreSheet>(container, SearCoreSheet.symbol);
    if (core) this.bindCore(core);
    this.#textShaper = resolveOptional(container, TextShaper.symbol) ?? this.#textShaper;
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

  #handleEditorDeleteKey(direction: 'backward' | 'forward' = 'backward', byWord = false): void {
    this.#executeEditorInput({ kind: 'delete', direction, byWord });
  }

  #handleStartEditingKey(): void {
    if (this.#isEditing) return;
    const cell = this.#selectionPlugin.getState()[0].getPoint(0);
    if (cell[0] < 0 || cell[1] < 0) return;
    this.#openCellEditor(this.#resolveCore(), cell[0], cell[1], false);
  }

  #insertCurrentDateTime(kind: 'date' | 'time'): boolean {
    if (this.#isEditing || !this.#commands?.has(InsertCurrentDateTimeCommand) || !this.#queries?.has(GetActiveCell))
      return false;
    this.#commands.run(InsertCurrentDateTimeCommand, kind);
    return true;
  }

  #handleEditorEnterKey(shiftKey: boolean, primaryModifier = false): void {
    if (this.#acceptSelectedFormulaSuggestion()) return;
    const searCore = this.#resolveCore();
    const extendsSheet = !primaryModifier && !shiftKey &&
      this.#selectionPlugin.getDownwardEntryExtensionIndex() !== null;
    const historyId = extendsSheet ? `cell-boundary-entry:${++this.#boundaryCommitSequence}` : null;
    if (!this.commitEdit(searCore, primaryModifier, historyId ? { id: historyId, phase: 'begin' } : undefined)) return;
    if (!primaryModifier && !shiftKey)
      this.#selectionPlugin.extendForDownwardEntry(historyId ? { id: historyId, phase: 'end' } : undefined);
    if (!primaryModifier)
      this.#selectionPlugin.navigate(shiftKey ? SelectionMoveDirection.Up : SelectionMoveDirection.Down);
    this.#selectionPlugin.restartNavigation();
  }

  #handleEditorEscapeKey(): void {
    if (this.#formulaAssistState.suggestions.length) {
      this.#publishFormulaAssist({ suggestions: [], selectedIndex: 0, signature: null, diagnostic: null, anchor: null });
      return;
    }
    this.cancelEdit(this.#resolveCore());
    this.#selectionPlugin.restartNavigation();
  }

  #handleEditorArrowLeft(shiftKey: boolean, primaryModifier: boolean, altKey = false): void {
    if (primaryModifier) this.#moveEditorToLineBoundary('start', shiftKey);
    else if (altKey) this.#executeEditorInput({ kind: 'wordBoundary', boundary: 'previous', shiftKey });
    else this.#executeEditorInput({ kind: 'arrow', direction: DocCursorDirection.Left, shiftKey });
  }

  #handleEditorArrowRight(shiftKey: boolean, primaryModifier: boolean, altKey = false): void {
    if (primaryModifier) this.#moveEditorToLineBoundary('end', shiftKey);
    else if (altKey) this.#executeEditorInput({ kind: 'wordBoundary', boundary: 'next', shiftKey });
    else this.#executeEditorInput({ kind: 'arrow', direction: DocCursorDirection.Right, shiftKey });
  }

  #moveEditorToLineBoundary(boundary: 'start' | 'end', shiftKey: boolean): void {
    this.#executeEditorInput({ kind: 'lineBoundary', boundary, shiftKey });
  }

  #handleEditorSuggestionBoundary(boundary: 'start' | 'end', shiftKey: boolean): void {
    if (!shiftKey && this.#formulaAssistState.suggestions.length) {
      this.#getCommandBus()?.run(MoveFormulaSuggestionCommand, { boundary });
      return;
    }
    this.#moveEditorToLineBoundary(boundary, shiftKey);
  }

  #handleEditorSuggestionPage(direction: -1 | 1, shiftKey: boolean): void {
    if (!shiftKey && this.#formulaAssistState.suggestions.length)
      this.#getCommandBus()?.run(MoveFormulaSuggestionCommand, { direction, step: 'page' });
  }

  #handleEditorArrowUp(shiftKey: boolean): void {
    if (!shiftKey && this.#formulaAssistState.suggestions.length) {
      const commands = this.#getCommandBus();
      if (commands) {
        commands.run(MoveFormulaSuggestionCommand, { direction: -1 });
        return;
      }
    }
    this.#executeEditorInput({ kind: 'arrow', direction: DocCursorDirection.Up, shiftKey });
  }

  #handleEditorArrowDown(shiftKey: boolean): void {
    if (!shiftKey && this.#formulaAssistState.suggestions.length) {
      const commands = this.#getCommandBus();
      if (commands) {
        commands.run(MoveFormulaSuggestionCommand, { direction: 1 });
        return;
      }
    }
    this.#executeEditorInput({ kind: 'arrow', direction: DocCursorDirection.Down, shiftKey });
  }

  #handleEditorTabKey(shiftKey: boolean): void {
    if (!shiftKey && this.#acceptSelectedFormulaSuggestion()) return;
    const searCore = this.#resolveCore();
    const extendsSheet = !shiftKey && this.#selectionPlugin.getRightwardEntryExtensionIndex() !== null;
    const historyId = extendsSheet ? `cell-boundary-entry:${++this.#boundaryCommitSequence}` : null;
    if (!this.commitEdit(searCore, false, historyId ? { id: historyId, phase: 'begin' } : undefined)) return;
    if (!shiftKey)
      this.#selectionPlugin.extendForRightwardEntry(historyId ? { id: historyId, phase: 'end' } : undefined);
    this.#selectionPlugin.navigate(shiftKey ? SelectionMoveDirection.Left : SelectionMoveDirection.Right);
    this.#selectionPlugin.restartNavigation();
  }

  #handleEditorSelectAllKey(): void {
    this.#executeEditorInput({ kind: 'selectAll' });
  }

  #handleEditorSoftEnterKey(): void {
    this.#executeEditorInput({ kind: 'softEnter' });
  }

  /** Returns the core owned by this editor-local plugin instance. */
  #resolveCore(): SearCoreSheet {
    const core = this.#commandCore ?? this.#core;
    if (!core) throw new SearError('SheetCellEditorPlugin is not bound to a Sheet editor core.');
    return core;
  }

  #getCommandBus(_core?: SearCoreSheet): SheetCommandBus | null {
    if (this.#commands) return this.#commands;
    this.#platform?.warn('SheetCellEditorPlugin getCommandBus skipped: SheetCommandBus is missing.');
    return null;
  }

  #runCellEditorCommand<Input>(
    core: SearCoreSheet,
    definition: SheetCommandDefinition<Input>,
    input: Input,
  ): void {
    const commands = this.#getCommandBus(core);
    if (!commands) return;
    const previousCore = this.#commandCore;
    this.#commandCore = core;
    try {
      commands.run(definition, input);
    } finally {
      this.#commandCore = previousCore;
    }
  }

  #executeEditorInput(input: SheetDocumentInputCommandInput): void {
    const commands = this.#getCommandBus();
    if (!commands) return;
    commands.run(HandleDocumentInputCommand, input);
  }

  #applyDocumentInputCommand(input: SheetDocumentInputCommandInput): void {
    this.#referencePick = null;
    this.#lastPickedReference = null;
    if (!this.#isEditing && TextInput.isTextInput(input) && input.text) {
      const anchor = this.#queries?.run(GetActiveCell, void 0);
      if (!anchor) return;
      this.#openCellEditor(this.#resolveCore(), anchor[0], anchor[1], true);
    }
    const session = this.#editSession;
    if (!session) return;
    const documentBefore = session.getDocument() as RichDocNode[];
    const before = documentBefore.map(paraText).join('\n');
    const selectionBefore = session.getSelection();
    let update;
    if (input.kind === TextInputKind.Text) {
      const anchorOffset = selectionBefore
        ? getDocumentOffset(documentBefore, selectionBefore.anchor as DocSelection['anchor'])
        : before.length;
      const headOffset = selectionBefore
        ? getDocumentOffset(documentBefore, selectionBefore.head as DocSelection['head'])
        : before.length;
      const start = Math.min(anchorOffset, headOffset);
      const end = Math.max(anchorOffset, headOffset);
      const limit = SheetCellInputValidationRegistry.validateTextLimits(
        before.slice(0, start) + input.text + before.slice(end),
      );
      if (limit?.reject) {
        this.#publishCellInputRejection(limit.message ?? 'Invalid cell value', before.length + input.text.length);
        return;
      }
      const caret = selectionBefore
        ? getDocumentOffset(documentBefore, selectionBefore.head as DocSelection['head'])
        : null;
      const collapsed =
        selectionBefore &&
        getDocumentOffset(documentBefore, selectionBefore.anchor as DocSelection['anchor']) === caret;
      if (input.text === ')' && collapsed && caret !== null && this.#formulaAutoClose.consume(caret, before)) {
        const next = formulaDocumentPosition(documentBefore, caret + 1);
        update = session.setSelection({ anchor: next, head: next });
      } else update = session.handleInput({ type: 'insertText', text: input.text });
    } else if (input.kind === 'delete') {
      if (input.byWord && selectionBefore) {
        const anchor = getDocumentOffset(documentBefore, selectionBefore.anchor as DocSelection['anchor']);
        const head = getDocumentOffset(documentBefore, selectionBefore.head as DocSelection['head']);
        if (anchor === head) {
          const other =
            input.direction === 'forward' ? nextWordBoundary(before, head) : previousWordBoundary(before, head);
          session.setSelection({
            anchor: formulaDocumentPosition(documentBefore, head),
            head: formulaDocumentPosition(documentBefore, other),
          });
        }
      }
      update = session.handleInput({ type: 'deleteContent', direction: input.direction ?? 'backward' });
    } else if (input.kind === 'lineBoundary') {
      const head = selectionBefore
        ? getDocumentOffset(documentBefore, selectionBefore.head as DocSelection['head'])
        : before.length;
      const target =
        input.boundary === 'start'
          ? before.lastIndexOf('\n', Math.max(0, head - 1)) + 1
          : before.indexOf('\n', head) < 0
          ? before.length
          : before.indexOf('\n', head);
      const position = formulaDocumentPosition(documentBefore, target);
      update = session.setSelection({
        anchor: input.shiftKey && selectionBefore ? selectionBefore.anchor : position,
        head: position,
      });
    } else if (input.kind === 'wordBoundary') {
      const head = selectionBefore
        ? getDocumentOffset(documentBefore, selectionBefore.head as DocSelection['head'])
        : before.length;
      const target =
        input.boundary === 'previous' ? previousWordBoundary(before, head) : nextWordBoundary(before, head);
      const position = formulaDocumentPosition(documentBefore, target);
      update = session.setSelection({
        anchor: input.shiftKey && selectionBefore ? selectionBefore.anchor : position,
        head: position,
      });
    } else if (input.kind === TextInputKind.CompositionUpdate) {
      update = session.handleInput({ type: 'compositionUpdate', text: input.text });
    } else if (input.kind === 'arrow') {
      update = session.handleInput({
        type: 'keyDown',
        key:
          input.direction === DocCursorDirection.Left
            ? 'ArrowLeft'
            : input.direction === DocCursorDirection.Right
            ? 'ArrowRight'
            : input.direction === DocCursorDirection.Up
            ? 'ArrowUp'
            : 'ArrowDown',
        shiftKey: input.shiftKey,
      });
    } else if (input.kind === 'selectAll') {
      update = session.handleInput({ type: 'keyDown', key: 'a', ctrlKey: true });
    } else if (input.kind === 'softEnter') {
      update = session.handleInput({ type: 'keyDown', key: 'Enter', altKey: true });
    } else if (input.kind === 'keyDown') {
      update = session.handleInput({
        type: 'keyDown',
        key: input.key,
        ctrlKey: input.ctrlKey,
        metaKey: input.metaKey,
        shiftKey: input.shiftKey,
      });
    } else {
      const selection: SheetTextSelection = {
        anchor: { path: [...input.anchor.path], offset: input.anchor.offset },
        head: { path: [...input.head.path], offset: input.head.offset },
      };
      update = session.setSelection(selection);
    }
    this.#formulaAutoClose.reconcile(before, (session.getDocument() as RichDocNode[]).map(paraText).join('\n'));
    this.#syncSessionState();
    this.#blinker.reset();
    const selection = update.selection ?? this.#editSession?.getSelection();
    if (selection) this.#updateSheetDocumentSelection(selection);
    this.#refreshFormulaAssist();
    this.#requestRerender();
  }

  #refreshFormulaAssist(): void {
    const session = this.#editSession;
    const registry = this.#functionRegistry;
    if (!session || !registry || session.getComposition()?.active) {
      this.#formulaAnalysis = null;
      this.#publishFormulaAssist({
        suggestions: [],
        selectedIndex: 0,
        signature: null,
        diagnostic: null,
        anchor: null,
      });
      return;
    }
    const document = session.getDocument() as RichDocNode[];
    const selection = session.getSelection();
    if (
      !selection ||
      getDocumentOffset(document, selection.anchor as DocSelection['anchor']) !==
        getDocumentOffset(document, selection.head as DocSelection['head'])
    ) {
      this.#formulaAnalysis = null;
      this.#publishFormulaAssist({
        suggestions: [],
        selectedIndex: 0,
        signature: null,
        diagnostic: null,
        anchor: null,
      });
      return;
    }
    const text = document.map(paraText).join('\n');
    const caret = getDocumentOffset(document, selection.head as DocSelection['head']);
    this.#formulaAnalysis = analyzeFormulaInput(text, caret, registry);
    const diagnostic =
      this.#formulaParser && this.#formulaAnalysis.suggestions.length === 0
        ? diagnoseFormulaInput(text, this.#formulaParser, registry)
        : null;
    const awaitingFirstArgument =
      diagnostic?.kind === 'error' &&
      this.#formulaAnalysis.signature &&
      diagnostic.message.startsWith(`${this.#formulaAnalysis.signature.name} requires at least `) &&
      text[caret - 1] === '(' &&
      text[caret] === ')';
    this.#publishFormulaAssist({
      suggestions: this.#formulaAnalysis.suggestions,
      selectedIndex: 0,
      signature: this.#formulaAnalysis.signature,
      diagnostic: awaitingFirstArgument ? null : diagnostic,
      anchor: this.#getFormulaAssistAnchor(),
    });
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

  #publishFormulaAssist(state: FormulaInputAssistState): void {
    this.#formulaAssistState = cloneFormulaInputAssistState(state);
    runOutsideCommandExecution(() =>
      this.#formulaAssistListeners?.forEach((listener) => {
        try {
          listener(cloneFormulaInputAssistState(this.#formulaAssistState));
        } catch (error) {
          this.#platform.warn('Formula assist listener failed.', error);
        }
      }),
    );
  }

  #moveFormulaSuggestion(input: FormulaSuggestionMove): boolean {
    const count = this.#formulaAssistState.suggestions.length;
    if (!count) return false;
    const selectedIndex = 'boundary' in input
      ? input.boundary === 'start' ? 0 : count - 1
      : input.step === 'page'
        ? Math.max(0, Math.min(count - 1, this.#formulaAssistState.selectedIndex + input.direction * 5))
        : (this.#formulaAssistState.selectedIndex + input.direction + count) % count;
    this.#publishFormulaAssist({ ...this.#formulaAssistState, selectedIndex });
    return true;
  }

  #acceptSelectedFormulaSuggestion(): boolean {
    const suggestion = this.#formulaAssistState.suggestions[this.#formulaAssistState.selectedIndex];
    if (!suggestion) return false;
    this.#getCommandBus()?.run(AcceptFormulaSuggestionCommand, { name: suggestion.name });
    return true;
  }

  #acceptFormulaSuggestion(name: string): void {
    const session = this.#editSession;
    const analysis = this.#formulaAnalysis;
    if (!session || !analysis?.suggestions.some((suggestion) => suggestion.name === name)) return;
    const document = session.getDocument() as RichDocNode[];
    const text = document.map(paraText).join('\n');
    const anchor = formulaDocumentPosition(document, analysis.replaceStart);
    const head = formulaDocumentPosition(document, analysis.replaceEnd);
    session.setSelection({ anchor, head });
    const suffix = text[analysis.replaceEnd] === '(' ? '' : '()';
    const update = session.handleInput({ type: 'insertText', text: name + suffix });
    this.#formulaAutoClose.reconcile(text, (session.getDocument() as RichDocNode[]).map(paraText).join('\n'));
    if (suffix) this.#formulaAutoClose.add(analysis.replaceStart + name.length + 1);
    const caret = formulaDocumentPosition(
      session.getDocument() as RichDocNode[],
      analysis.replaceStart + name.length + 1,
    );
    session.setSelection({ anchor: caret, head: caret });
    this.#syncSessionState();
    const selection = session.getSelection() ?? update.selection;
    if (selection) this.#updateSheetDocumentSelection(selection);
    this.#refreshFormulaAssist();
    this.#requestRerender();
    this.#textInput.refocus();
  }

  #cycleReference(): void {
    const session = this.#editSession;
    if (!session || session.getComposition()?.active) return;
    const document = session.getDocument() as RichDocNode[];
    const selection = session.getSelection();
    if (!selection) return;
    const text = document.map(paraText).join('\n');
    const anchor = getDocumentOffset(document, selection.anchor as DocSelection['anchor']);
    const head = getDocumentOffset(document, selection.head as DocSelection['head']);
    const cycle = cycleFormulaReference(text, Math.min(anchor, head), Math.max(anchor, head));
    if (!cycle) return;
    session.setSelection({
      anchor: formulaDocumentPosition(document, cycle.start),
      head: formulaDocumentPosition(document, cycle.end),
    });
    session.handleInput({ type: 'insertText', text: cycle.replacement });
    const nextDocument = session.getDocument() as RichDocNode[];
    const caret = formulaDocumentPosition(nextDocument, cycle.caret);
    session.setSelection({ anchor: caret, head: caret });
    this.#formulaAutoClose.reconcile(text, nextDocument.map(paraText).join('\n'));
    this.#syncSessionState();
    this.#updateSheetDocumentSelection(session.getSelection()!);
    this.#refreshFormulaAssist();
    this.#requestRerender();
    this.#textInput.refocus();
  }

  #syncSessionState(): void {
    if (!this.#editSession) return;
    this.#session.pendingDoc = [...this.#editSession.getDocument()] as RichDocNode[];
    const selection = this.#editSession.getSelection();
    if (selection) {
      this.#session.docSelection = {
        anchor: { path: [...selection.anchor.path].map(Number), offset: selection.anchor.offset },
        head: { path: [...selection.head.path].map(Number), offset: selection.head.offset },
      };
    }
    this.#publishFormulaBarState();
  }

  #updateSheetDocumentSelection(selection: SheetTextSelection): void {
    const commands = this.#getCommandBus(this.#resolveCore());
    if (!commands) return;
    commands.run(UpdateCellEditorDocumentSelectionCommand, {
      anchor: [Number(selection.anchor.path[0] ?? 0), selection.anchor.offset],
      head: [Number(selection.head.path[0] ?? 0), selection.head.offset],
    });
  }

  #requestRerender(): void {
    if (!this.#isEditing) return;
    const core = this.#commandCore ?? this.#core;
    if (!core) return;
    const commands = this.#getCommandBus(core);
    if (!commands) return;
    commands.run(RequestCellEditorRenderCommand, void 0);
  }

  /** Registers the commands. */
  public registerCommands(commands: SheetCommandBus): void {
    if (this.#commands && this.#commands !== commands) {
      throw new SearError('Sheet cell editor commands are already bound to an editor.');
    }
    this.#commands = commands;
    this.#referencePickBindingClosed = true;
    if (this.#queries) registerSheetRangeTextStyleCommand(commands, this.#queries, this.#embeddedEditor);
    const cellEditor = this;
    commands.register(
      StartFormulaBarEditCommand,
      () =>
        new LocalActionCommand(StartFormulaBarEditCommand.id, () => {
          if (cellEditor.#isEditing) return;
          const cell = cellEditor.#queries?.run(GetActiveCell, void 0);
          if (cell) cellEditor.#openCellEditor(cellEditor.#resolveCore(), cell[0], cell[1], false);
        }),
    );
    commands.register(
      SetFormulaBarDraftCommand,
      (input) => new LocalActionCommand(SetFormulaBarDraftCommand.id, () => cellEditor.#setFormulaBarDraft(input)),
    );
    commands.register(
      HandleFormulaBarKeyCommand,
      (input) =>
        new LocalActionCommand(HandleFormulaBarKeyCommand.id, () => {
          if (!cellEditor.#isEditing) return;
          switch (input.action) {
            case 'enter':
              cellEditor.#handleEditorEnterKey(input.shiftKey, input.primaryModifier);
              break;
            case 'tab':
              cellEditor.#handleEditorTabKey(input.shiftKey);
              break;
            case 'softEnter':
              cellEditor.#handleEditorSoftEnterKey();
              break;
            case 'suggestionUp':
              cellEditor.#handleEditorArrowUp(false);
              break;
            case 'suggestionDown':
              cellEditor.#handleEditorArrowDown(false);
              break;
            case 'suggestionPageUp':
              cellEditor.#handleEditorSuggestionPage(-1, false);
              break;
            case 'suggestionPageDown':
              cellEditor.#handleEditorSuggestionPage(1, false);
              break;
            case 'suggestionHome':
              cellEditor.#handleEditorSuggestionBoundary('start', false);
              break;
            case 'suggestionEnd':
              cellEditor.#handleEditorSuggestionBoundary('end', false);
              break;
            case 'escape':
              cellEditor.#handleEditorEscapeKey();
              break;
          }
        }),
    );
    commands.register(BeginCellEditCommand, function createBeginCellEditCommand(input) {
      return cellEditor.#createBeginCellEditCommand(input);
    });
    commands.register(OpenCellEditorCommand, function createOpenCellEditorCommand(input) {
      return cellEditor.#createOpenCellEditorCommand(input);
    });
    commands.register(CommitCellEditCommand, function createCommitCellEditCommand(input) {
      return cellEditor.#createCommitCellEditCommand(input);
    });
    commands.register(InsertCurrentDateTimeCommand, (kind) => cellEditor.#createCurrentDateTimeCommand(kind));
    commands.register(CancelCellEditCommand, function createCancelCellEditCommand(input) {
      return cellEditor.#createCancelCellEditCommand(input);
    });
    commands.register(HandleDocumentInputCommand, function createDocumentInputCommand(input) {
      return new LocalActionCommand(HandleDocumentInputCommand.id, function applyDocumentInput(): void {
        cellEditor.#applyDocumentInputCommand(input);
      });
    });
    commands.register(
      HandleCellEditorPointerCommand,
      (input) =>
        new LocalActionCommand(HandleCellEditorPointerCommand.id, () => cellEditor.#handleEditorPointer(input)),
    );
    commands.register(
      BeginCellEditorDragSelectionCommand,
      () => new LocalActionCommand(BeginCellEditorDragSelectionCommand.id, () => cellEditor.#beginDragSelection()),
    );
    commands.register(
      EndCellEditorDragSelectionCommand,
      (input) =>
        new LocalActionCommand(EndCellEditorDragSelectionCommand.id, () =>
          cellEditor.#endDragSelection(input.disposeCapture),
        ),
    );
    commands.register(
      ReplaceFormulaReferenceCommand,
      (input) =>
        new LocalActionCommand(ReplaceFormulaReferenceCommand.id, () => cellEditor.#insertPickedReference(input)),
    );
    commands.register(
      EndFormulaReferencePickCommand,
      () =>
        new LocalActionCommand(EndFormulaReferencePickCommand.id, () => {
          cellEditor.#referencePick = null;
        }),
    );
    commands.register(AcceptFormulaSuggestionCommand, function createAcceptFormulaSuggestionCommand(input) {
      return new LocalActionCommand(AcceptFormulaSuggestionCommand.id, () =>
        cellEditor.#acceptFormulaSuggestion(input.name),
      );
    });
    commands.register(MoveFormulaSuggestionCommand, function createMoveFormulaSuggestionCommand(input) {
      return new LocalActionCommand(MoveFormulaSuggestionCommand.id, () => {
        cellEditor.#moveFormulaSuggestion(input);
      });
    });
    commands.register(
      UpdateFormulaAssistAnchorCommand,
      (anchor) =>
        new LocalActionCommand(UpdateFormulaAssistAnchorCommand.id, () => {
          if (!cellEditor.#isEditing) return;
          cellEditor.#publishFormulaAssist({ ...cellEditor.#formulaAssistState, anchor });
        }),
    );
    commands.register(
      CycleFormulaReferenceCommand,
      () => new LocalActionCommand(CycleFormulaReferenceCommand.id, () => cellEditor.#cycleReference()),
    );
    commands.register(RestoreFormulaEditDraftCommand, function createRestoreFormulaEditDraftCommand(input) {
      return new LocalActionCommand(RestoreFormulaEditDraftCommand.id, () =>
        cellEditor.#restoreFormulaDraft(input.draft, input.reference),
      );
    });
    commands.register(RequestCellEditorRenderCommand, function createCellEditorRenderCommand() {
      return new LocalActionCommand(RequestCellEditorRenderCommand.id, function requestCellEditorRender(): void {
        if (cellEditor.#isEditing) cellEditor.#resolveCore().requestRender(cellEditor);
      });
    });
    commands.register(
      UpdateCellEditorDocumentSelectionCommand,
      function createCellEditorDocumentSelectionCommand(input: SheetDocumentSelectionCommandInput) {
        const { anchor, head } = input;
        const transaction = createSheetTransaction(cellEditor.pluginKey, [
          createUpdateRectOTOperation([2], anchor, head),
        ]);
        return new TransactionPipelineCommand(UpdateCellEditorDocumentSelectionCommand.id, transaction);
      },
    );
    commands.register(
      SetCellInlineStyleCommand,
      function createCellInlineStyleCommand(input: SheetInlineStyleCommandInput) {
        return new LocalActionCommand(SetCellInlineStyleCommand.id, function setCellInlineStyle(): void {
          const session = cellEditor.#editSession;
          if (!session) return;
          const update = session.setInlineStyle(input);
          cellEditor.#syncSessionState();
          if (update.selection) cellEditor.#updateSheetDocumentSelection(update.selection);
          cellEditor.#requestRerender();
        });
      },
    );
  }

  #setFormulaBarDraft(input: {
    readonly text: string;
    readonly selectionStart: number;
    readonly selectionEnd: number;
  }): void {
    if (!this.#isEditing) {
      const cell = this.#queries?.run(GetActiveCell, void 0);
      if (!cell) return;
      this.#openCellEditor(this.#resolveCore(), cell[0], cell[1], false);
    }
    const session = this.#editSession;
    if (!session) return;
    const document = session.getDocument() as RichDocNode[];
    const previous = document.map(paraText).join('\n');
    if (previous !== input.text) {
      this.#lastPickedReference = null;
      let start = 0;
      while (start < previous.length && start < input.text.length && previous[start] === input.text[start]) start += 1;
      let previousEnd = previous.length;
      let nextEnd = input.text.length;
      while (previousEnd > start && nextEnd > start && previous[previousEnd - 1] === input.text[nextEnd - 1]) {
        previousEnd -= 1;
        nextEnd -= 1;
      }
      session.setSelection({
        anchor: formulaDocumentPosition(document, start),
        head: formulaDocumentPosition(document, previousEnd),
      });
      session.handleInput({ type: 'insertText', text: input.text.slice(start, nextEnd) });
      this.#formulaAutoClose.reconcile(previous, input.text);
    }
    const updated = session.getDocument() as RichDocNode[];
    const limit = updated.map(paraText).join('\n').length;
    const selection =
      session.setSelection({
        anchor: formulaDocumentPosition(updated, Math.max(0, Math.min(input.selectionStart, limit))),
        head: formulaDocumentPosition(updated, Math.max(0, Math.min(input.selectionEnd, limit))),
      }).selection ?? session.getSelection();
    this.#syncSessionState();
    if (selection) this.#updateSheetDocumentSelection(selection);
    this.#refreshFormulaAssist();
    this.#requestRerender();
  }

  /** Registers the read-only draft projection used during workbook sheet switching. */
  public registerQueries(queries: SheetQueryRegistry): void {
    queries.register(IsCellEditingQuery, () => this.#isEditing);
    queries.register(ReadFormulaEditDraftQuery, () => this.#readFormulaDraft());
    queries.register(ReadSelectedCellEditTextQuery, () => this.#readSelectedCellEditText());
  }

  #readSelectedCellEditText(): string | null {
    const session = this.#editSession;
    if (!this.#isEditing || !session) return null;
    const document = session.getDocument() as RichDocNode[];
    const selection = session.getSelection();
    if (!selection) return '';
    const anchor = getDocumentOffset(document, selection.anchor as DocSelection['anchor']);
    const head = getDocumentOffset(document, selection.head as DocSelection['head']);
    return document.map(paraText).join('\n').slice(Math.min(anchor, head), Math.max(anchor, head));
  }

  #readFormulaDraft(): FormulaEditDraft | null {
    const session = this.#editSession;
    if (!this.#isEditing || !session) return null;
    const document = session.getDocument() as RichDocNode[];
    const text = document.map(paraText).join('\n');
    const selection = session.getSelection();
    if (!selection) return null;
    const start = getDocumentOffset(document, selection.anchor as DocSelection['anchor']);
    const end = getDocumentOffset(document, selection.head as DocSelection['head']);
    if (!canPickFormulaReference(text, end)) return null;
    const cell = this.getState()[0].getPoint(0);
    return {
      cell: [...cell] as typeof cell,
      text,
      selectionStart: start,
      selectionEnd: end,
      autoClosingParentheses: this.#formulaAutoClose.snapshot(),
    };
  }

  #restoreFormulaDraft(draft: FormulaEditDraft, reference?: string): void {
    const core = this.#resolveCore();
    this.#openCellEditor(core, draft.cell[0], draft.cell[1], true);
    const session = this.#editSession;
    if (!session) return;
    session.handleInput({ type: 'insertText', text: draft.text });
    this.#formulaAutoClose.restore(draft.autoClosingParentheses ?? [], draft.text);
    const document = session.getDocument() as RichDocNode[];
    session.setSelection({
      anchor: formulaDocumentPosition(document, draft.selectionStart),
      head: formulaDocumentPosition(document, draft.selectionEnd),
    });
    if (reference)
      this.#runCellEditorCommand(core, ReplaceFormulaReferenceCommand, {
        reference,
        start: draft.selectionStart,
        end: draft.selectionEnd,
      });
    else {
      this.#syncSessionState();
      const selection = session.getSelection();
      if (selection) this.#updateSheetDocumentSelection(selection);
      this.#refreshFormulaAssist();
      this.#requestRerender();
    }
  }

  #insertPickedReference({ reference, start, end, pickStart, pickKind }: SheetFormulaReferenceReplacementInput): void {
    const session = this.#editSession;
    if (!session) return;
    if (pickStart)
      this.#referencePick = {
        start: [...pickStart] as Point,
        kind: pickKind ?? 'cell',
        replaceStart: start,
        replaceEnd: end,
      };
    const document = session.getDocument() as RichDocNode[];
    const before = document.map(paraText).join('\n');
    session.setSelection({
      anchor: formulaDocumentPosition(document, start),
      head: formulaDocumentPosition(document, end),
    });
    const update = session.handleInput({ type: 'insertText', text: reference });
    if (this.#referencePick) {
      this.#referencePick.replaceEnd = start + reference.length;
      this.#lastPickedReference = { start, text: reference, cell: this.#referencePick.start };
    }
    this.#formulaAutoClose.reconcile(before, (session.getDocument() as RichDocNode[]).map(paraText).join('\n'));
    this.#syncSessionState();
    const selection = update.selection ?? session.getSelection();
    if (selection) this.#updateSheetDocumentSelection(selection);
    this.#refreshFormulaAssist();
    this.#requestRerender();
  }

  #createBeginCellEditCommand(input: SheetBeginCellEditInput): PipelineExecutionCommand {
    return new PipelineExecutionCommand(BeginCellEditCommand.id, this.#createBeginCellEditPipeline(input));
  }

  #createBeginCellEditPipeline(input: SheetBeginCellEditInput): Pipeline {
    const tx = createSheetTransaction(this.pluginKey, [
      createUpdateRectOTOperation([0], input.anchor, input.anchor),
      createUpdateRectOTOperation([1], input.anchor, input.focus),
    ]);
    const pipeline = new Pipeline(SheetCellEditorPipelineName.EnterEditMode);
    pipeline.add(SheetCellEditorPipelineStepName.OpenEditor, tx);
    pipeline.addInteraction(SheetCellEditorPipelineStepName.StartEditSession, {
      type: SheetCellEditorInteractionName.SessionStarted,
      target: input.anchor,
      editor: input.editor,
    });
    pipeline.addPostRender(SheetHighlightPipelineStepName.Refresh, SheetHighlightPlugin.pluginKey);
    return pipeline;
  }

  #createCommitCellEditCommand(input: SheetCommitCellEditInput | void): PipelineExecutionCommand {
    if (!this.#canCommitFormula(input?.fillSelection)) {
      return new PipelineExecutionCommand(
        CommitCellEditCommand.id,
        new Pipeline(SheetCellEditorPipelineName.CommitEdit),
      );
    }
    const core = this.#resolveCore();
    const nextSelection = input?.nextSelection;
    const name =
      input?.pipelineName ??
      (nextSelection ? SheetCellEditorPipelineName.EditExitAndSelect : SheetCellEditorPipelineName.CommitEdit);
    const pipeline = input?.fillSelection
      ? this.#buildCommitPipeline(core, name, true)
      : this.#buildCommitPipeline(core, name);
    if (nextSelection) {
      pipeline.add(SheetCellEditorPipelineStepName.SelectCell, this.#createSelectionTransaction(nextSelection));
      pipeline.addInteraction(SheetSelectionPipelineStepName.RecordSelectionChange, {
        type: SheetSelectionInteractionName.Changed,
        anchor: nextSelection.anchor,
        focus: nextSelection.focus,
        source: SheetSelectionSource.Pointer,
      });
    }
    this.#appendEditExitInteraction(pipeline, input?.reason ?? SheetCellEditorExitReason.Commit);
    return new PipelineExecutionCommand(CommitCellEditCommand.id, pipeline, input?.historyGroup);
  }

  #createCurrentDateTimeCommand(kind: 'date' | 'time'): PipelineExecutionCommand {
    const pipeline = new Pipeline('cell.insertCurrentDateTime');
    const core = this.#resolveCore();
    const cell = this.#queries?.run(GetActiveCell, void 0);
    const fields = readCellEditorSheetFields(core.getDataEngine());
    if (!cell || !fields || cell[0] < 0 || cell[1] < 0 || this.#isEditing) {
      return new PipelineExecutionCommand(InsertCurrentDateTimeCommand.id, pipeline);
    }

    const now = new Date(this.#platform.currentDateTime());
    const year = now.getFullYear();
    const month = now.getMonth();
    const day = now.getDate();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const text =
      kind === 'date'
        ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        : `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    if (this.#inputValidation?.validate(cell[0], cell[1], text).reject) {
      return new PipelineExecutionCommand(InsertCurrentDateTimeCommand.id, pipeline);
    }

    const is1904 = this.#dateSystemProvider?.getDateSystem() === FormulaDateSystem.Excel1904;
    const daySerial =
      (Date.UTC(year, month, day) - Date.UTC(is1904 ? 1904 : 1899, is1904 ? 0 : 11, is1904 ? 1 : 31)) / 86_400_000;
    const value =
      kind === 'date'
        ? daySerial + (!is1904 && daySerial >= 60 ? 1 : 0)
        : (hours * 3600 + minutes * 60 + seconds) / 86_400;
    const previous = fields.sheetData.getItem(cell[0], cell[1]);
    pipeline.add(
      'insert-static-value',
      createSheetTransaction(SheetDataPlugin.pluginKey, [
        createUpdateCellOTOperation<CellMatrixElement>(cell, { type: CellType.Number, value }, previous),
      ]),
    );
    if (fields.cellFormats) {
      const formatOperations = createSetRangeCellFormatOperations(
        {
          anchor: cell,
          focus: cell,
          format: kind === 'date' ? CellFormats.date : CellFormats.time,
        },
        {
          target: SheetCellFormatPlugin.pluginKey,
          getRowCount: () => fields.sheetData.shape[0],
          getColumnCount: () => fields.sheetData.shape[1],
          readCellFormat: (row, col) => fields.cellFormats?.getItem(row, col) ?? null,
        },
      );
      pipeline.add('format-static-value', createSheetTransaction(SheetCellFormatPlugin.pluginKey, formatOperations));
    }
    return new PipelineExecutionCommand(InsertCurrentDateTimeCommand.id, pipeline);
  }

  #createCancelCellEditCommand(_input: SheetCancelCellEditInput | void): PipelineExecutionCommand {
    const core = this.#resolveCore();
    const { transaction, dirtyRects } = this.#performCleanup(core);
    const pipeline = new Pipeline(SheetCellEditorPipelineName.CancelEdit);
    pipeline.add(SheetCellEditorPipelineStepName.ExitEditMode, transaction);
    dirtyRects.forEach((rect) => pipeline.markDirty(rect));
    this.#appendEditExitInteraction(pipeline, SheetCellEditorExitReason.Cancel);
    pipeline.addPostCommit('finish-cell-edit', () => this.#finishEditSession('cancel'));
    return new PipelineExecutionCommand(CancelCellEditCommand.id, pipeline);
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
  public override onDblClick(searCore: SearCoreSheet, event: EventWithOffsetAndTarget<CellProperties>): boolean {
    if (this.#selectionPlugin.onFillHandleDoubleClick(event)) return false;
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

  #openCellEditor(searCore: SearCoreSheet, row: number, col: number, replaceContent: boolean): void {
    const mergedCell = this.#mergePlugin.isMergedCell(row, col);
    const anchor: Point = mergedCell ? mergedCell.getPoint(0) : [row, col];
    const focus: Point = mergedCell ? mergedCell.getPoint(1) : [row, col];
    this.#runCellEditorCommand(searCore, EnsureSelectionVisibleCommand, { anchor, focus });
    this.#runCellEditorCommand(searCore, OpenCellEditorCommand, { row, column: col, replaceContent });
  }

  #createOpenCellEditorCommand(input: SheetOpenCellEditorInput): PipelineExecutionCommand {
    if (!this.#embeddedEditor) {
      throw new SearError('SheetCellEditorPlugin requires a SheetEmbeddedEditor to edit rich-text cell content.');
    }
    const searCore = this.#resolveCore();
    const { row, column: col, replaceContent = false } = input;

    // Determine anchor (merged area top-left) and focus (merged area bottom-right)
    const mergedCell = this.#mergePlugin.isMergedCell(row, col);
    const anchor: Point = mergedCell ? mergedCell.getPoint(0) : [row, col];
    const focus: Point = mergedCell ? mergedCell.getPoint(1) : [row, col];

    // Read existing cell data as initial editor content
    const dataState = readCellEditorSheetFields(searCore.getDataEngine());
    const cellData = dataState?.sheetData.getItem(anchor[0], anchor[1]);

    // Formula cells persist their source in `formula`; their displayed
    // result is derived separately and must never become editor content.
    const rawValue = replaceContent
      ? undefined
      : getCellEditableValue(cellData, { row: anchor[0], col: anchor[1] }, this.#formulaSourceProvider);
    const format = dataState?.cellFormats?.getItem(anchor[0], anchor[1]) ?? null;
    const editValue = cellData?.type === CellType.Number && typeof rawValue === 'number'
      ? formatCellNumberForEditor(rawValue, format, this.#cellFormatLocaleProvider?.getCellFormatLocale())
      : rawValue;
    let initialDoc: RichDocNode[];
    if (Array.isArray(editValue)) {
      initialDoc = normalizeDocForEdit(editValue as RichDocNode[]);
    } else if (typeof editValue === 'string' || typeof editValue === 'number' || typeof editValue === 'boolean') {
      initialDoc = String(editValue).split(/\r\n|\r|\n/).flatMap((line) => stringToRichDoc(line));
    } else {
      initialDoc = normalizeDocForEdit([]);
    }

    const pipeline = this.#createBeginCellEditPipeline({ anchor, focus, editor: SheetCellEditorKind.Cell });
    let preparedContext: SheetEmbeddedEditorContext | null = null;
    let preparedSession: SheetEditSession | null = null;
    pipeline.addPreparedAction('prepare-cell-editor', () => {
      const context = this.#createEmbeddedEditorContext(searCore, anchor, focus, initialDoc);
      preparedSession = this.#embeddedEditor!.createEditSession(context);
      preparedContext = context;
      return () => {
        preparedSession?.dispose();
        preparedSession = null;
        preparedContext = null;
      };
    });
    pipeline.addPostCommit('activate-cell-editor', () => {
      if (!preparedContext || !preparedSession)
        throw new SearError('Cell editor session was not prepared before commit.');
      try {
        this.#activateCellEditor(preparedContext, preparedSession, initialDoc);
      } catch (error) {
        try {
          this.#runCellEditorCommand(searCore, CancelCellEditCommand, { restoreOriginalDocument: true });
        } catch (cleanupError) {
          this.#platform?.warn('Cell editor activation cleanup failed.', cleanupError);
        }
        throw error;
      } finally {
        preparedSession = null;
        preparedContext = null;
      }
    });
    return new PipelineExecutionCommand(OpenCellEditorCommand.id, pipeline);
  }

  #activateCellEditor(
    context: SheetEmbeddedEditorContext,
    editSession: SheetEditSession,
    initialDoc: RichDocNode[],
  ): void {
    this.#embeddedContext = context;
    this.#editSession = editSession;
    this.#initialEditSnapshot = JSON.stringify(editSession.getDocument());
    this.#highlighter.clear();
    this.#formulaAutoClose.clear();
    this.#isEditing = true;
    this.#session.pendingDoc = initialDoc;
    const lastParaIdx = Math.max(0, initialDoc.length - 1);
    const lastOffset = getTextNodeLength(initialDoc, [lastParaIdx, 0]);
    this.#session.docSelection = {
      anchor: { path: [lastParaIdx, 0], offset: lastOffset },
      head: { path: [lastParaIdx, 0], offset: lastOffset },
    };
    this.#syncSessionState();

    this.#textInput.startListener();
    this.#subscribeEditHandlers();
    this.#keyboardRouter.startListener();
    this.#blinker.start();
    this.#cursorEngine.override('text');
    this.#refreshFormulaAssist();
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
  public override onMouseDown(
    searCore: SearCoreSheet,
    event: EventWithOffsetAndTarget<CellProperties>,
  ): boolean | void {
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
      const pickKind: PickedReferenceKind = region === CellRegion.RowHeader ? 'row'
        : region === CellRegion.ColumnHeader ? 'column' : 'cell';
      if (!this.#isEditing && this.#referencePickService?.hasPendingPick()) {
        event.origin.preventDefault();
        this.#crossSheetReferencePick = { start: selected.anchor, end: selected.anchor };
        return false;
      }
      const draft = this.#readFormulaDraft();
      const previousPick = this.#lastPickedReference;
      const replacesPreviousPick = !!(
        draft && previousPick &&
        draft.selectionStart === draft.selectionEnd &&
        draft.selectionEnd === previousPick.start + previousPick.text.length &&
        draft.text.slice(previousPick.start, draft.selectionEnd) === previousPick.text
      );
      if (
        this.#isEditing && draft && !pointerInsideEditor &&
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
      const target: CellProperties | null = properties?.type === undefined
        ? null
        : { ...properties, type: properties.type };
      const point = { x: offsetX, y: offsetY };
      const cursor = this.#cursorRegistry.resolve(target, {
        core: searCore,
        origin: event.origin,
        view: this.#coordinates.viewToWorld(point, { x: 0, y: 0 }),
        world: this.#coordinates.viewToWorld(point),
        target,
      });
      const isResizeHandle = cursor === CursorToken.RowResize || cursor === CursorToken.ColumnResize;
      const selectionUpdate = isResizeHandle ? null : buildSelectionUpdate(searCore, event, this.pluginKey);
      const input = {
        reason: SheetCellEditorExitReason.OutsideClick,
        pipelineName: SheetCellEditorPipelineName.EditExitAndSelect,
      } satisfies SheetCommitCellEditInput;
      this.#runCellEditorCommand(
        searCore,
        CommitCellEditCommand,
        selectionUpdate ? { ...input, nextSelection: selectionUpdate } : input,
      );
      if (!this.#isEditing) this.#selectionPlugin.restartNavigation();
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
  public override onMouseMove(
    searCore: SearCoreSheet,
    event: EventWithOffsetAndTarget<CellProperties>,
  ): boolean | void {
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
    this.#syncSessionState();
    if (update.selection) this.#updateSheetDocumentSelection(update.selection);
    this.#refreshFormulaAssist();
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
  public override onMouseUp(_searCore: SearCoreSheet, event: EventWithOffsetAndTarget<CellProperties>): boolean | void {
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

  // ─── Exit edit mode: commit / cancel / cleanup ─────────────────────────

  /** Commits the active cell edit session through its owning command. */
  public commitEdit(
    searCore: SearCoreSheet,
    fillSelection = false,
    historyGroup?: SheetCommandResult['historyGroup'],
  ): boolean {
    if (!this.#isEditing) return false;
    this.#runCellEditorCommand(searCore, CommitCellEditCommand, {
      reason: SheetCellEditorExitReason.Commit,
      fillSelection,
      historyGroup,
    });
    return !this.#isEditing;
  }

  #canCommitFormula(fillSelection = false): boolean {
    const document = (this.#editSession?.getDocument() ?? this.#session.pendingDoc) as RichDocNode[];
    const text = completeFormulaForCommit(document.map(paraText).join('\n'));
    const diagnostic = this.#formulaParser
      ? diagnoseFormulaInput(text, this.#formulaParser, this.#functionRegistry ?? undefined)
      : null;
    if (!diagnostic || diagnostic.kind === 'warning') {
      const limit = SheetCellInputValidationRegistry.validateTextLimits(text);
      if (limit?.reject) {
        this.#publishCellInputRejection(limit.message ?? 'Invalid cell value', text.length);
        return false;
      }
      const anchor = this.getState()[0].getPoint(0);
      for (const [row, col] of this.#getCommitTargets(anchor, fillSelection)) {
        const validation = this.#inputValidation?.validate(row, col, text);
        if (!validation?.reject) continue;
        this.#publishCellInputRejection(validation.message ?? 'Invalid cell value', text.length, [row, col]);
        return false;
      }
      return true;
    }
    this.#publishFormulaAssist({
      ...this.#formulaAssistState,
      suggestions: [],
      diagnostic,
      anchor: this.#getFormulaAssistAnchor(),
    });
    this.#textInput.refocus();
    return false;
  }

  #getCommitTargets(anchor: Point, fillSelection: boolean): Point[] {
    const ranges = fillSelection && this.#queries?.has(GetSelections) ? this.#queries.run(GetSelections, void 0) : [];
    if (!ranges.length) return [anchor];
    const rowVisibility = this.#core ? readSheetRowVisibility(this.#core.getDataEngine()) : null;
    const targets: Point[] = [];
    const visited = new Set<string>();
    for (const range of ranges) {
      for (let row = range.start[0]; row <= range.end[0]; row += 1) {
        if (rowVisibility?.active && rowVisibility.isRowFiltered(row)) continue;
        for (let col = range.start[1]; col <= range.end[1]; col += 1) {
          const merge = this.#mergePlugin.isMergedCell(row, col);
          if (merge) {
            const mergeAnchor = merge.getPoint(0);
            if (mergeAnchor[0] !== row || mergeAnchor[1] !== col) continue;
          }
          const key = `${row}:${col}`;
          if (visited.has(key)) continue;
          visited.add(key);
          targets.push([row, col]);
        }
      }
    }
    return targets;
  }

  #publishCellInputRejection(message: string, end: number, cell = this.getState()[0].getPoint(0)): void {
    this.#publishFormulaAssist({
      ...this.#formulaAssistState,
      suggestions: [],
      diagnostic: {
        kind: 'error',
        message,
        start: 0,
        end,
        ...(cell[0] >= 0 && cell[1] >= 0
          ? { cellAddress: `${columnIndexToLabel(cell[1])}${cell[0] + 1}` }
          : {}),
      },
      anchor: this.#getFormulaAssistAnchor(),
    });
    this.#textInput.refocus();
  }

  /** Cancels the active cell edit session without committing its draft. */
  public cancelEdit(searCore: SearCoreSheet): void {
    if (!this.#isEditing) return;
    this.#runCellEditorCommand(searCore, CancelCellEditCommand, { restoreOriginalDocument: true });
  }

  /**
   * Build a named Pipeline for committing the current edit.
   *
   * Step 1 — commit-cell-value: persists the edited cell data.
   * Step 2 — exit-edit-mode:   clears editor overlay / cursor / listeners.
   *
   * The caller can append further steps (e.g. select-cell) before calling
   * the named command pipeline. Each step is logged to the
   * console so the entire operation is observable.
   */
  #buildCommitPipeline(
    searCore: SearCoreSheet,
    name: string = SheetCellEditorPipelineName.CommitEdit,
    fillSelection = false,
  ): Pipeline {
    const pipeline = new Pipeline(name);

    // Step 1: Cell value update
    const editorState = searCore.getDataEngine().getDataType<EditorState>(this.pluginKey);
    if (editorState) {
      const anchor = editorState[0].getPoint(0);
      const dataState = readCellEditorSheetFields(searCore.getDataEngine());
      // Reopening and closing an unchanged cell must preserve its stored type and explicit formatting.
      if (
        dataState &&
        (fillSelection || JSON.stringify(this.#editSession?.getDocument()) !== this.#initialEditSnapshot)
      ) {
        const editedDocument = this.#editSession?.getDocument() ?? this.#session.pendingDoc;
        const richDocument = editedDocument as RichDocNode[];
        // Extract the editor's plain-text content.
        const plainText = completeFormulaForCommit(
          isDocSemanticallyEmpty(richDocument) ? '' : richDocument.map(paraText).join('\n'),
        );

        const prevValue = dataState.sheetData.getItem(anchor[0], anchor[1]);
        const formatLocale = this.#cellFormatLocaleProvider?.getCellFormatLocale();
        const commitContext = {
          row: anchor[0],
          col: anchor[1],
          plainText,
          richText: richDocument,
          previous: prevValue,
          format: dataState.cellFormats?.getItem(anchor[0], anchor[1]) ?? null,
          ...(formatLocale === undefined ? {} : { formatLocale }),
        };
        const { cell: newValue, format: inferredFormat } = this.#commitStrategies.commitWithFormat(commitContext);

        const operations = [];
        const ranges = fillSelection && this.#queries?.has(GetSelections) ? this.#queries.run(GetSelections, void 0) : [];
        const targets = this.#getCommitTargets(anchor, fillSelection);
        if (ranges.length) {
          for (const [row, col] of targets) {
            const oldValue = dataState.sheetData.getItem(row, col);
            const value = newValue
              ? this.#cellCodecs?.get(newValue.type)?.rebase?.(newValue, {
                rowDelta: row - anchor[0], columnDelta: col - anchor[1],
              }) ?? newValue
              : null;
            operations.push(createUpdateCellOTOperation<CellMatrixElement>([row, col], value, oldValue));
          }
        } else operations.push(createUpdateCellOTOperation<CellMatrixElement>(anchor, newValue, prevValue));
        const tx = createSheetTransaction(SheetDataPlugin.pluginKey, operations);
        pipeline.add(SheetCellEditorPipelineStepName.CommitValue, tx);
        if (plainText.includes('\n') && this.#textShaper) {
          const rowSizes = readSheetRowSizes(searCore.getDataEngine());
          if (rowSizes) {
            const config = readSheetConfig(searCore);
            const font = createFontDescriptor({
              fontSize: config.sheetCellFontSize ?? 10,
              fontFamily: config.sheetCellFontFamily ?? 'sans-serif',
            });
            const contentHeight = plainText
              .split('\n')
              .reduce((height, line) => height + this.#textShaper!.shape({ text: line || ' ', font }).height, 0);
            const requiredHeight = Math.ceil(contentHeight + 16);
            const rows = new Set(operations.map((operation) => operation.p[0]));
            const resizeOperations = [...rows].flatMap((row) => {
              const currentHeight = rowSizes.getItem(0, row) ?? 0;
              return requiredHeight > currentHeight
                ? [createResizeRowOTOperation([row], requiredHeight, currentHeight)]
                : [];
            });
            if (resizeOperations.length) {
              pipeline.add(
                'expand-multiline-rows',
                createSheetTransaction(SheetResizePlugin.pluginKey, resizeOperations),
              );
            }
          }
        }
        if (inferredFormat && dataState.cellFormats) {
          const formatRanges = ranges.length
            ? targets.map((point) => ({ start: point, end: point }))
            : [{ start: anchor, end: anchor }];
          const formatOperations = formatRanges.flatMap((range) =>
            createSetRangeCellFormatOperations(
              {
                anchor: range.start,
                focus: range.end,
                format: inferredFormat,
              },
              {
                target: SheetCellFormatPlugin.pluginKey,
                getRowCount: () => dataState.sheetData.shape[0],
                getColumnCount: () => dataState.sheetData.shape[1],
                readCellFormat: (row, col) => dataState.cellFormats?.getItem(row, col) ?? null,
              },
            ),
          );
          pipeline.add(
            'commit-inferred-format',
            createSheetTransaction(SheetCellFormatPlugin.pluginKey, formatOperations),
          );
        }
      }
    }

    // Step 2: Exit edit mode (clears editor overlay, cursor, listeners)
    const { transaction: cleanupTx, dirtyRects } = this.#performCleanup(searCore);
    pipeline.add(SheetCellEditorPipelineStepName.ExitEditMode, cleanupTx);
    dirtyRects.forEach((rect) => pipeline.markDirty(rect));
    pipeline.addPostCommit('finish-cell-edit', () => this.#finishEditSession('commit'));

    return pipeline;
  }

  #createSelectionTransaction(selection: {
    readonly anchor: Point;
    readonly focus: Point;
    readonly active?: Point;
  }): Transaction {
    const operations = [
      createUpdateRectOTOperation([0], selection.active ?? selection.anchor, selection.active ?? selection.focus),
      createUpdateRectOTOperation([1], selection.anchor, selection.focus),
    ];
    return createSheetTransaction(this.#selectionPlugin.pluginKey, operations);
  }

  #appendEditExitInteraction(pipeline: Pipeline, reason: SheetCellEditorExitReason): void {
    pipeline.addInteraction(SheetCellEditorPipelineStepName.EndEditSession, {
      type: SheetCellEditorInteractionName.SessionEnded,
      reason,
    });
    pipeline.addPostRender(SheetHighlightPipelineStepName.Refresh, SheetHighlightPlugin.pluginKey);
  }

  /**
   * Plans the editor state reset without changing the active edit session.
   *
   * Returns the transaction and any dirty rects that should be
   * flushed before the final render. The dirty rects are NOT applied
   * immediately; the caller should pass them to Pipeline.markDirty() so the
   * frame-level dirty tracker consumes it together with scene mutations.
   */
  #performCleanup(_searCore: SearCoreSheet): {
    transaction: Transaction;
    dirtyRects: PositionRect<HexColor>[];
  } {
    if (Plugin.prototype.hasStateWriteBoundary.call(this) && !this.#commands?.isExecuting()) {
      throw new SearError('Sheet cell editor changes must run through editor.commands.run(...).');
    }
    const dirtyRects: PositionRect<HexColor>[] = [];
    if (this.#lastEditorRect) {
      const { x, y, width, height } = this.#lastEditorRect;
      dirtyRects.push(new PositionRect<HexColor>(x, y, width, height));
      if (this.#lastOverflowLeftX !== null && this.#lastOverflowLeftX < x) {
        const overflowWidth = x - this.#lastOverflowLeftX - 1;
        if (overflowWidth > 0) {
          dirtyRects.push(new PositionRect<HexColor>(this.#lastOverflowLeftX, y, overflowWidth, height));
        }
      }
    }

    const emptyRect = createEmptyRectShape();
    const operations = [
      createUpdateRectOTOperation([0], emptyRect[0], emptyRect[1]),
      createUpdateRectOTOperation([1], emptyRect[0], emptyRect[1]),
      createUpdateRectOTOperation([2], emptyRect[0], emptyRect[1]),
    ];
    return { transaction: createSheetTransaction(this.pluginKey, operations), dirtyRects };
  }

  #finishEditSession(action: 'commit' | 'cancel'): void {
    try {
      if (action === 'commit') this.#editSession?.commit();
      else this.#editSession?.cancel();
    } finally {
      try {
        this.#disposeEmbeddedSession();
      } finally {
        this.#completeCleanup();
      }
    }
  }

  #completeCleanup(): void {
    this.#blinker.stop();
    this.#isEditing = false;
    this.#initialEditSnapshot = null;
    // Ensure drag state is always cleaned up regardless of how editing ended.
    this.#isDragSelecting = false;
    this.#referencePick = null;
    this.#crossSheetReferencePick = null;
    this.#lastPickedReference = null;
    this.#formulaAutoClose.clear();
    this.#disposePointerCapture?.();
    this.#disposePointerCapture = null;
    this.#highlighter.clear();
    this.#formulaAnalysis = null;
    this.#publishFormulaAssist({ suggestions: [], selectedIndex: 0, signature: null, diagnostic: null, anchor: null });

    this.#cursorEngine.override(null);

    this.#lastEditorRect = null;
    this.#lastOverflowLeftX = null;

    // Selection mode also receives text, using the same input surface so an
    // in-flight composition survives the transition into cell editing.
    this.#publishFormulaBarState();
  }

  #disposeEmbeddedSession(): void {
    this.#disposeEditKeyboardHandlers?.();
    this.#disposeEditKeyboardHandlers = null;
    try {
      this.#editSession?.dispose();
    } finally {
      this.#editSession = null;
      this.#embeddedContext = null;
    }
  }

  // ─── Plugin interface: state registration / reducer / render ───────────

  /** Returns the plugin config. */
  public getPluginConfig(_searCore: SearCoreSheet): null {
    return null;
  }

  /** Registers visual defaults for the inline cell editor. */
  public override registerConfig() {
    return [
      {
        key: this.key,
        config: new ConfigUnit(SheetCellEditorPlugin.defaultConfig),
      },
    ];
  }

  /** @inheritdoc */
  public override registerState(): { key: PluginKey; state: EditorState } {
    return { key: this.pluginKey, state: this.getState() };
  }

  /** Locks committed editor selection rectangles while staged clones stay writable. */
  public override lockCommittedState(state: EditorState): void {
    state.forEach((range) => range.lockMutations());
    Object.freeze(state);
  }

  /** Applies a transaction to SheetCellEditorPlugin state. */
  public apply(pluginState: EditorState, transaction: Transaction): EditorState | null {
    const { operations } = transaction;
    operations.forEach((op) => {
      if (RectOTActionName.UpdateRect in op && op.ur !== void 0) {
        if (op.p[0] === 2) {
          pluginState[2] = RectOT.apply(pluginState[2], [op]);
        } else {
          pluginState[op.p[0] as 0 | 1] = RectOT.apply(pluginState[op.p[0]], [op]);
        }
      }
    });
    return pluginState;
  }

  /**
   * Synchronizes document selection only after the editor rectangle transaction
   * is committed, so a later failed pipeline step cannot alter the live editor
   * session.
   * @param transaction - Successfully committed transaction.
   */
  public override onTransactionCommitted(transaction: Transaction): void {
    if (this.#commands && !this.#commands.isExecuting()) {
      throw new SearError('Sheet editor session changes must run through editor.commands.run(...).');
    }
    if (transaction.pluginKey !== this.pluginKey) {
      if (
        transaction.pluginKey === this.#selectionPlugin?.pluginKey ||
        transaction.pluginKey === SheetDataPlugin.pluginKey
      )
        this.#publishFormulaBarState();
      return;
    }
    const updatesDocumentSelection = transaction.operations.some(
      (operation) => RectOTActionName.UpdateRect in operation && operation.ur !== void 0 && operation.p[0] === 2,
    );
    if (!updatesDocumentSelection) {
      this.#publishFormulaBarState();
      return;
    }
    const selection = this.getState()[2];
    const anchor = selection.getPoint(0);
    const head = selection.getPoint(1);
    this.#session.docSelection = {
      anchor: { path: [anchor[0], 0], offset: anchor[1] },
      head: { path: [head[0], 0], offset: head[1] },
    };
    this.#publishFormulaBarState();
  }

  /** Renders SheetCellEditorPlugin scene output. */
  public render(
    searCore: SearCoreSheet,
    offset: { x: number; y: number } = {
      x: readSheetConfig(searCore).sheetOffsetX ?? 50,
      y: readSheetConfig(searCore).sheetOffsetY ?? 24,
    },
  ): Node<CellProperties>[] {
    const dataEngine = searCore.getDataEngine();
    const editorState = dataEngine.getDataType<EditorState>(this.pluginKey);
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
    const editorY = editorHeight > baseHeight &&
      startY >= viewportTop && startY < viewportBottom &&
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
    if (this.#formulaAssistState.suggestions.length || this.#formulaAssistState.signature) {
      const anchor = this.#getFormulaAssistAnchor();
      const previous = this.#formulaAssistState.anchor;
      if (anchor && (!previous || previous.x !== anchor.x || previous.y !== anchor.y)) {
        this.#getCommandBus(searCore)?.run(UpdateFormulaAssistAnchorCommand, anchor);
      }
    }

    // ── Create editor cell node ───────────────────────────────────────────
    const { renderCoordinatorManager } = searCore.renderEngine;
    const pluginConfig =
      searCore.configEngine.getPluginConfig?.<SheetCellEditorConfig>(this.key) ?? SheetCellEditorPlugin.defaultConfig;
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

function resolveOptional<Service>(container: Container, identifier: string | symbol): Service | undefined {
  try {
    return container.resolve<Service>(identifier);
  } catch (_error) {
    return void 0;
  }
}

function readSheetConfig(searCore: SearCoreSheet): Partial<SheetConfig> {
  return searCore.configEngine.getDefaultConfig() as Partial<SheetConfig>;
}

function isSheetEmbeddedEditor(value: unknown): value is SheetEmbeddedEditor {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SheetEmbeddedEditor>;
  return (
    typeof candidate.initialize === 'function' &&
    typeof candidate.createRenderSession === 'function' &&
    typeof candidate.createEditSession === 'function' &&
    typeof candidate.dispose === 'function'
  );
}

function previousWordBoundary(text: string, caret: number): number {
  let index = caret;
  while (index > 0 && /\s/u.test(text[index - 1])) index -= 1;
  const word = index > 0 && /[\p{L}\p{N}_]/u.test(text[index - 1]);
  while (index > 0 && !/\s/u.test(text[index - 1]) && /[\p{L}\p{N}_]/u.test(text[index - 1]) === word) index -= 1;
  return index;
}

function nextWordBoundary(text: string, caret: number): number {
  let index = caret;
  while (index < text.length && /\s/u.test(text[index])) index += 1;
  const word = index < text.length && /[\p{L}\p{N}_]/u.test(text[index]);
  while (index < text.length && !/\s/u.test(text[index]) && /[\p{L}\p{N}_]/u.test(text[index]) === word) index += 1;
  return index;
}
