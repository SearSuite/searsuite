import { DocEditModel } from '@searsuite/sear-assembly-doc';
import { readSheetColumnSizes } from '@searsuite/sear-plugin-resize';
import { type CellDocumentFormatting, type SheetCellEditorOptions } from './SheetCellEditorOptions';
import { PublishCellEditDraftCommand, SynchronizeCellEditModelCommand } from './SheetCellEditorCommands';
import { IsCellEditingQuery } from './IsCellEditingQuery';
import { ReadSelectedCellEditTextQuery } from './ReadSelectedCellEditTextQuery';
import { SearError } from '@searsuite/sear-foundation-error';
import { columnIndexToLabel } from '@searsuite/sear-foundation-utils';
import { CellMatrixElement, SheetMatrix } from '@searsuite/sear-domain-sheet';
import { Pipeline, runOutsideCommandExecution } from '@searsuite/sear-assembly-plugin';
import {
  RectOT,
  RectOTActionName,
  createUpdateRectOTOperation,
  createUpdateCellOTOperation,
  createResizeRowOTOperation,
} from '@searsuite/sear-domain-ot';
import { DocCursorDirection } from '@searsuite/sear-domain-commands';
import { Plugin, PluginKey } from '@searsuite/sear-assembly-plugin';
import { Point, createEmptyRect, createEmptyRectShape } from '@searsuite/sear-foundation-rect';
import { Injectable } from '@searsuite/sear-foundation-di';
import { Transaction } from '@searsuite/sear-domain-transaction';

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
import { readSheetCellAlignments } from '@searsuite/sear-plugin-alignment';
import { SheetCellMergePlugin } from '@searsuite/sear-plugin-cell-merge';

import {
  createSetRangeCellFormatOperations,
  readSheetCellFormats,
  SheetCellFormatPlugin,
  type CellFormatMatrix,
} from '@searsuite/sear-plugin-cell-format';
import {
  SheetSelectionInteractionName,
  SheetSelectionPipelineStepName,
  SheetSelectionPlugin,
  SheetSelectionSource,
  EnsureSelectionVisibleCommand,
  GetActiveCell,
  GetSelections,
} from '@searsuite/sear-plugin-selection';
import { SheetDataPlugin } from '@searsuite/sear-plugin-sheet-data';
import { readSheetDataMatrix, readSheetRowVisibility } from '@searsuite/sear-domain-sheet';
import { type DataEngine } from '@searsuite/sear-domain-state';
import { readSheetRowSizes, SheetResizePlugin } from '@searsuite/sear-plugin-resize';
import { type CSRMatrix, type DimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import { TextInputKind } from '@searsuite/sear-domain-commands';

import {
  FormulaDateSystem,
  IFormulaParser,
  IFormulaSourceProvider,
  IFormulaDateSystemProvider,
  type IFunctionRegistry,
} from '@searsuite/sear-domain-formula-engine';
import { type ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { SheetFormulaBarObservation, type SheetFormulaBarState } from './SheetFormulaBarObservation';
import {
  RichDocNode,
  DocSelection,
  normalizeDocForEdit,
  stringToRichDoc,
  isDocSemanticallyEmpty,
  paraText,
  getDocumentOffset,
  cloneRichDocument,
} from '@searsuite/sear-domain-doc';
import { type SheetTextSelection } from '@searsuite/sear-assembly-doc';
import { EditorState } from './EditorTypes';
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
import { registerSheetRangeTextStyleCommand } from './SheetRangeTextStyleCommand';
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
  ReplaceFormulaReferenceCommand,
  EndFormulaReferencePickCommand,
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
import { type FormulaEditDraft } from './formulaAssist/FormulaReferencePick';
import { ReadFormulaEditDraftQuery } from './formulaAssist/ReadFormulaEditDraftQuery';
import { canPickFormulaReference, type PickedReferenceKind } from './formulaAssist/formatPickedReference';
import { completeFormulaForCommit } from './formulaAssist/completeFormulaForCommit';
import { FormulaAutoCloseTracker } from './formulaAssist/FormulaAutoCloseTracker';
import { cycleFormulaReference } from './formulaAssist/cycleFormulaReference';
import { diagnoseFormulaInput } from './formulaAssist/diagnoseFormulaInput';

const key = new PluginKey('SheetCellEditor');

interface CellEditorSheetFields {
  sheetData: SheetMatrix;
  rowSizes: DimensionsCSRMatrix;
  columnSizes: DimensionsCSRMatrix;
  cellAlignments: CSRMatrix<string> | null;
  cellFormats: CellFormatMatrix | null;
}

function readCellEditorSheetFields(dataEngine: DataEngine): CellEditorSheetFields | null {
  const rowSizes = readSheetRowSizes(dataEngine),
    columnSizes = readSheetColumnSizes(dataEngine);
  const geometry = rowSizes && columnSizes ? { rowSizes, columnSizes } : null;
  const sheetData = readSheetDataMatrix(dataEngine);
  const cellAlignments = readSheetCellAlignments(dataEngine);
  const cellFormats = readSheetCellFormats(dataEngine);
  if (!sheetData || !geometry) return null;
  return { sheetData, rowSizes: geometry.rowSizes, columnSizes: geometry.columnSizes, cellAlignments, cellFormats };
}

/** Coordinates Sheet cell edit sessions, text input, and embedded editors. */
@Injectable()
export class SheetCellEditorPlugin extends Plugin<EditorState> {
  readonly #mergePlugin: SheetCellMergePlugin;
  readonly #selectionPlugin: SheetSelectionPlugin;
  readonly #platform: Platform;
  readonly #commitStrategies: CellCommitStrategyRegistry;
  readonly #formulaSourceProvider: IFormulaSourceProvider | undefined;
  readonly #cellFormatLocaleProvider: ICellFormatLocaleProvider | undefined;
  readonly #queries: SheetQueryRegistry | undefined;
  readonly #formulaParser: IFormulaParser | undefined;
  readonly #inputValidation: SheetCellInputValidationRegistry | undefined;
  readonly #dateSystemProvider: IFormulaDateSystemProvider | undefined;
  readonly #cellCodecs: CellClipboardCodecRegistry | undefined;

  readonly #data: DataEngine;
  readonly #formatting: CellDocumentFormatting;
  public constructor(options: SheetCellEditorOptions) {
    super({ key, state: [createEmptyRect(), createEmptyRect(), createEmptyRect()] });
    this.#data = options.data;
    this.#mergePlugin = options.merges;
    this.#selectionPlugin = options.selection;
    this.#platform = options.platform;
    this.#commitStrategies = options.commitStrategies;
    this.#formulaSourceProvider = options.formulaSourceProvider;
    this.#cellFormatLocaleProvider = options.cellFormatLocaleProvider;
    this.#queries = options.queries;
    this.#formulaParser = options.formulaParser;
    this.#inputValidation = options.inputValidation;
    this.#dateSystemProvider = options.dateSystemProvider;
    this.#cellCodecs = options.cellCodecs;
    this.#formatting = options.formatting;
    registerSheetCellEditorInteractionReducers(options.interactionReducers);
  }
  public isEditing(): boolean {
    return this.#isEditing;
  }
  /** Read-only view of the single document owner. Mutation authority remains command-scoped. */
  public readEditModel(): DocEditModel | null {
    return this.#editSession;
  }
  public readDocumentSession() {
    return { pendingDoc: cloneRichDocument(this.#session.pendingDoc), docSelection: this.getDocumentSelection() };
  }
  public readFormulaAssist() {
    return cloneFormulaInputAssistState(this.#formulaAssistState);
  }
  public readReferencePick() {
    return this.#referencePick ? { ...this.#referencePick, start: [...this.#referencePick.start] as Point } : null;
  }
  public readLastPickedReference() {
    return this.#lastPickedReference
      ? { ...this.#lastPickedReference, cell: [...this.#lastPickedReference.cell] as Point }
      : null;
  }
  public onEditorDestroy(): void {
    this.assertRuntimeWriteAllowed();
    this.#disposeEmbeddedSession();
    this.#formulaAssistListeners.clear();
    this.#formulaBarListeners.clear();
  }
  /** DI token for resolving SheetCellEditorPlugin. */
  public static readonly symbol: symbol = Symbol.for('SheetCellEditorPlugin');
  /** Stable plugin key for SheetCellEditorPlugin. */
  public static readonly pluginKey = key;

  // ─── Editing session state ─────────────────────────────────────────────

  #isEditing: boolean = false;
  #boundaryCommitSequence = 0;

  // ─── Embedded editor session ───────────────────────────────────────────

  #editSession: DocEditModel | null = null;
  #initialEditSnapshot: string | null = null;
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
  #functionRegistry: IFunctionRegistry | null = null;
  #formulaAnalysis: FormulaInputAnalysis | null = null;
  #formulaAssistState: FormulaInputAssistState = {
    suggestions: [],
    selectedIndex: 0,
    signature: null,
    diagnostic: null,
    anchor: null,
  };
  readonly #formulaAssistListeners = new Set<(state: FormulaInputAssistState) => void>();
  readonly #formulaBarListeners = new Set<(state: SheetFormulaBarState) => void>();
  #referencePick: {
    readonly start: Point;
    readonly kind: PickedReferenceKind;
    readonly replaceStart: number;
    replaceEnd: number;
  } | null = null;
  #lastPickedReference: { readonly start: number; readonly text: string; readonly cell: Point } | null = null;
  readonly #formulaAutoClose = new FormulaAutoCloseTracker();
  #commands: SheetCommandBus | undefined;
  /** @inheritdoc */
  public override interestedIn: string[] = [];

  /** Binds the editor-local registry after formula services have been assembled. */
  public bindFormulaRegistry(registry: IFunctionRegistry): void {
    if (this.#functionRegistry && this.#functionRegistry !== registry) {
      throw new SearError('Sheet cell editor formula registry is already bound to an editor.');
    }
    this.#functionRegistry = registry;
  }

  /** Binds the optional parent-workbook reference picker. */

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
    const dataEngine = this.#data;
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

  #handleEditorDeleteKey(direction: 'backward' | 'forward' = 'backward', byWord = false): void {
    this.#executeEditorInput({ kind: 'delete', direction, byWord });
  }

  #handleStartEditingKey(): void {
    if (this.#isEditing) return;
    const cell = this.#selectionPlugin.getState()[0].getPoint(0);
    if (cell[0] < 0 || cell[1] < 0) return;
    this.#openCellEditor(cell[0], cell[1], false);
  }

  #insertCurrentDateTime(kind: 'date' | 'time'): boolean {
    if (this.#isEditing || !this.#commands?.has(InsertCurrentDateTimeCommand) || !this.#queries?.has(GetActiveCell))
      return false;
    this.#commands.run(InsertCurrentDateTimeCommand, kind);
    return true;
  }

  #handleEditorEnterKey(shiftKey: boolean, primaryModifier = false, minimumRowHeight?: number): void {
    if (this.#acceptSelectedFormulaSuggestion()) return;
    const extendsSheet =
      !primaryModifier && !shiftKey && this.#selectionPlugin.getDownwardEntryExtensionIndex() !== null;
    const historyId = extendsSheet ? `cell-boundary-entry:${++this.#boundaryCommitSequence}` : null;
    if (!this.commitEdit(primaryModifier, historyId ? { id: historyId, phase: 'begin' } : undefined, minimumRowHeight))
      return;
    if (!primaryModifier && !shiftKey)
      this.#selectionPlugin.extendForDownwardEntry(historyId ? { id: historyId, phase: 'end' } : undefined);
    if (!primaryModifier)
      this.#selectionPlugin.navigate(shiftKey ? SelectionMoveDirection.Up : SelectionMoveDirection.Down);
  }

  #handleEditorEscapeKey(): void {
    if (this.#formulaAssistState.suggestions.length) {
      this.#publishFormulaAssist({
        suggestions: [],
        selectedIndex: 0,
        signature: null,
        diagnostic: null,
        anchor: null,
      });
      return;
    }
    this.cancelEdit();
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

  #handleEditorTabKey(shiftKey: boolean, minimumRowHeight?: number): void {
    if (!shiftKey && this.#acceptSelectedFormulaSuggestion()) return;
    const extendsSheet = !shiftKey && this.#selectionPlugin.getRightwardEntryExtensionIndex() !== null;
    const historyId = extendsSheet ? `cell-boundary-entry:${++this.#boundaryCommitSequence}` : null;
    if (!this.commitEdit(false, historyId ? { id: historyId, phase: 'begin' } : undefined, minimumRowHeight)) return;
    if (!shiftKey)
      this.#selectionPlugin.extendForRightwardEntry(historyId ? { id: historyId, phase: 'end' } : undefined);
    this.#selectionPlugin.navigate(shiftKey ? SelectionMoveDirection.Left : SelectionMoveDirection.Right);
  }

  #handleEditorSelectAllKey(): void {
    this.#executeEditorInput({ kind: 'selectAll' });
  }

  #handleEditorSoftEnterKey(): void {
    this.#executeEditorInput({ kind: 'softEnter' });
  }
  #getCommandBus(): SheetCommandBus {
    if (!this.#commands) throw new SearError('Cell editor commands are not bound.');
    return this.#commands;
  }
  #runCellEditorCommand<Input>(definition: SheetCommandDefinition<Input>, input: Input): void {
    this.#getCommandBus().run(definition, input);
  }

  #executeEditorInput(input: SheetDocumentInputCommandInput): void {
    const commands = this.#getCommandBus();
    if (!commands) return;
    commands.run(HandleDocumentInputCommand, input);
  }

  #applyDocumentInputCommand(input: SheetDocumentInputCommandInput): void {
    this.#referencePick = null;
    this.#lastPickedReference = null;
    if (
      !this.#isEditing &&
      (input.kind === TextInputKind.Text || input.kind === TextInputKind.CompositionUpdate) &&
      input.text
    ) {
      const anchor = this.#queries?.run(GetActiveCell, void 0);
      if (!anchor) return;
      this.#openCellEditor(anchor[0], anchor[1], true);
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
    const selection = update.selection ?? this.#editSession?.getSelection();
    if (selection) this.#updateSheetDocumentSelection(selection);
    this.#refreshFormulaAssist();
    this.#publishDraftChange();
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
      anchor: this.#formulaAssistState.anchor,
    });
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
    const selectedIndex =
      'boundary' in input
        ? input.boundary === 'start'
          ? 0
          : count - 1
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
    this.#publishDraftChange();
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
    this.#publishDraftChange();
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
    const commands = this.#getCommandBus();
    if (!commands) return;
    commands.run(UpdateCellEditorDocumentSelectionCommand, {
      anchor: [Number(selection.anchor.path[0] ?? 0), selection.anchor.offset],
      head: [Number(selection.head.path[0] ?? 0), selection.head.offset],
    });
  }
  #publishDraftChange(): void {
    if (this.#isEditing) this.#getCommandBus().run(PublishCellEditDraftCommand, undefined);
  }

  /** Registers the commands. */
  public registerCommands(commands: SheetCommandBus): void {
    if (this.#commands && this.#commands !== commands) {
      throw new SearError('Sheet cell editor commands are already bound to an editor.');
    }
    this.#commands = commands;
    if (this.#queries) registerSheetRangeTextStyleCommand(commands, this.#queries, this.#formatting);
    commands.register(
      PublishCellEditDraftCommand,
      () =>
        new PipelineExecutionCommand(
          PublishCellEditDraftCommand.id,
          new Pipeline(PublishCellEditDraftCommand.id).invalidate('cell-edit-draft', this.key),
        ),
    );
    commands.register(
      SynchronizeCellEditModelCommand,
      () =>
        new LocalActionCommand(SynchronizeCellEditModelCommand.id, () => {
          this.#syncSessionState();
          const selection = this.#editSession?.getSelection();
          if (selection) this.#updateSheetDocumentSelection(selection);
          this.#refreshFormulaAssist();
          this.#publishDraftChange();
        }),
    );
    const cellEditor = this;
    commands.register(
      StartFormulaBarEditCommand,
      () =>
        new LocalActionCommand(StartFormulaBarEditCommand.id, () => {
          if (cellEditor.#isEditing) return;
          const cell = cellEditor.#queries?.run(GetActiveCell, void 0);
          if (cell) cellEditor.#openCellEditor(cell[0], cell[1], false);
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
              cellEditor.#handleEditorEnterKey(input.shiftKey, input.primaryModifier, input.minimumRowHeight);
              break;
            case 'tab':
              cellEditor.#handleEditorTabKey(input.shiftKey, input.minimumRowHeight);
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
          cellEditor.#publishDraftChange();
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
      this.#openCellEditor(cell[0], cell[1], false);
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
    this.#publishDraftChange();
  }

  /** Registers the read-only draft projection used during workbook sheet switching. */
  public registerQueries(queries: SheetQueryRegistry): void {
    queries.register(IsCellEditingQuery, () => this.#isEditing);
    queries.register(ReadFormulaEditDraftQuery, () => this.readFormulaDraft());
    queries.register(ReadSelectedCellEditTextQuery, () => this.readSelectedCellEditText());
  }

  public readSelectedCellEditText(): string | null {
    const session = this.#editSession;
    if (!this.#isEditing || !session) return null;
    const document = session.getDocument() as RichDocNode[];
    const selection = session.getSelection();
    if (!selection) return '';
    const anchor = getDocumentOffset(document, selection.anchor as DocSelection['anchor']);
    const head = getDocumentOffset(document, selection.head as DocSelection['head']);
    return document.map(paraText).join('\n').slice(Math.min(anchor, head), Math.max(anchor, head));
  }

  public readFormulaDraft(): FormulaEditDraft | null {
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
    this.#openCellEditor(draft.cell[0], draft.cell[1], true);
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
      this.#runCellEditorCommand(ReplaceFormulaReferenceCommand, {
        reference,
        start: draft.selectionStart,
        end: draft.selectionEnd,
      });
    else {
      this.#syncSessionState();
      const selection = session.getSelection();
      if (selection) this.#updateSheetDocumentSelection(selection);
      this.#refreshFormulaAssist();
      this.#publishDraftChange();
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
    this.#publishDraftChange();
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
    return pipeline;
  }

  #createCommitCellEditCommand(input: SheetCommitCellEditInput | void): PipelineExecutionCommand {
    if (!this.#canCommitFormula(input?.fillSelection)) {
      return new PipelineExecutionCommand(
        CommitCellEditCommand.id,
        new Pipeline(SheetCellEditorPipelineName.CommitEdit),
      );
    }
    if (
      input?.minimumRowHeight !== undefined &&
      (!Number.isFinite(input.minimumRowHeight) || input.minimumRowHeight <= 0)
    )
      throw new SearError('Minimum row height must be positive and finite.');
    const nextSelection = input?.nextSelection;
    const name =
      input?.pipelineName ??
      (nextSelection ? SheetCellEditorPipelineName.EditExitAndSelect : SheetCellEditorPipelineName.CommitEdit);
    const pipeline = input?.fillSelection
      ? this.#buildCommitPipeline(name, true, input?.minimumRowHeight)
      : this.#buildCommitPipeline(name, false, input?.minimumRowHeight);
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
    const cell = this.#queries?.run(GetActiveCell, void 0);
    const fields = readCellEditorSheetFields(this.#data);
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
    const { transaction } = this.#performCleanup();
    const pipeline = new Pipeline(SheetCellEditorPipelineName.CancelEdit);
    pipeline.add(SheetCellEditorPipelineStepName.ExitEditMode, transaction);
    this.#appendEditExitInteraction(pipeline, SheetCellEditorExitReason.Cancel);
    pipeline.addPostCommit('finish-cell-edit', () => this.#finishEditSession('cancel'));
    return new PipelineExecutionCommand(CancelCellEditCommand.id, pipeline);
  }

  #openCellEditor(row: number, col: number, replaceContent: boolean): void {
    const mergedCell = this.#mergePlugin.isMergedCell(row, col);
    const anchor: Point = mergedCell ? mergedCell.getPoint(0) : [row, col];
    const focus: Point = mergedCell ? mergedCell.getPoint(1) : [row, col];
    this.#runCellEditorCommand(EnsureSelectionVisibleCommand, { anchor, focus });
    this.#runCellEditorCommand(OpenCellEditorCommand, { row, column: col, replaceContent });
  }
  #createOpenCellEditorCommand(input: SheetOpenCellEditorInput): PipelineExecutionCommand {
    const { row, column: col, replaceContent = false } = input;
    const merged = this.#mergePlugin.isMergedCell(row, col);
    const anchor: Point = merged ? merged.getPoint(0) : [row, col];
    const focus: Point = merged ? merged.getPoint(1) : [row, col];
    const fields = readCellEditorSheetFields(this.#data);
    const cell = fields?.sheetData.getItem(anchor[0], anchor[1]);
    const raw = replaceContent
      ? undefined
      : getCellEditableValue(cell, { row: anchor[0], col: anchor[1] }, this.#formulaSourceProvider);
    const value =
      cell?.type === CellType.Number && typeof raw === 'number'
        ? formatCellNumberForEditor(
            raw,
            fields?.cellFormats?.getItem(...anchor) ?? null,
            this.#cellFormatLocaleProvider?.getCellFormatLocale(),
          )
        : raw;
    const initial = Array.isArray(value)
      ? normalizeDocForEdit(value as RichDocNode[])
      : typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
          .split(/\r\n|\r|\n/)
          .flatMap((line) => stringToRichDoc(line))
      : normalizeDocForEdit([]);
    const pipeline = this.#createBeginCellEditPipeline({ anchor, focus, editor: SheetCellEditorKind.Cell });
    let prepared: DocEditModel | null = null;
    pipeline.addPreparedAction('prepare-cell-edit-model', () => {
      prepared = new DocEditModel(initial, () => this.assertRuntimeWriteAllowed());
      return () => {
        prepared?.dispose();
        prepared = null;
      };
    });
    pipeline.addPostCommit('activate-cell-edit-model', () => {
      if (!prepared) throw new SearError('Edit model was not prepared.');
      this.#activateCellEditor(prepared, initial);
      prepared = null;
    });
    return new PipelineExecutionCommand(OpenCellEditorCommand.id, pipeline);
  }
  #activateCellEditor(session: DocEditModel, initialDoc: RichDocNode[]): void {
    this.#editSession?.dispose();
    this.#editSession = session;
    this.#initialEditSnapshot = JSON.stringify(session.getDocument());
    this.#formulaAutoClose.clear();
    this.#isEditing = true;
    this.#session.pendingDoc = initialDoc;
    this.#syncSessionState();
    this.#refreshFormulaAssist();
  }

  // ─── Exit edit mode: commit / cancel / cleanup ─────────────────────────

  /** Commits the active cell edit session through its owning command. */
  public commitEdit(
    fillSelection = false,
    historyGroup?: SheetCommandResult['historyGroup'],
    minimumRowHeight?: number,
  ): boolean {
    if (!this.#isEditing) return false;
    this.#runCellEditorCommand(CommitCellEditCommand, {
      reason: SheetCellEditorExitReason.Commit,
      fillSelection,
      historyGroup,
      minimumRowHeight,
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
      anchor: this.#formulaAssistState.anchor,
    });
    return false;
  }

  #getCommitTargets(anchor: Point, fillSelection: boolean): Point[] {
    const ranges = fillSelection && this.#queries?.has(GetSelections) ? this.#queries.run(GetSelections, void 0) : [];
    if (!ranges.length) return [anchor];
    const rowVisibility = readSheetRowVisibility(this.#data);
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
        ...(cell[0] >= 0 && cell[1] >= 0 ? { cellAddress: `${columnIndexToLabel(cell[1])}${cell[0] + 1}` } : {}),
      },
      anchor: this.#formulaAssistState.anchor,
    });
  }

  /** Cancels the active cell edit session without committing its draft. */
  public cancelEdit(): void {
    if (!this.#isEditing) return;
    this.#runCellEditorCommand(CancelCellEditCommand, { restoreOriginalDocument: true });
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
    name: string = SheetCellEditorPipelineName.CommitEdit,
    fillSelection = false,
    minimumRowHeight?: number,
  ): Pipeline {
    const pipeline = new Pipeline(name);

    // Step 1: Cell value update
    const editorState = this.#data.getDataType<EditorState>(this.pluginKey);
    if (editorState) {
      const anchor = editorState[0].getPoint(0);
      const dataState = readCellEditorSheetFields(this.#data);
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
        const ranges =
          fillSelection && this.#queries?.has(GetSelections) ? this.#queries.run(GetSelections, void 0) : [];
        const targets = this.#getCommitTargets(anchor, fillSelection);
        if (ranges.length) {
          for (const [row, col] of targets) {
            const oldValue = dataState.sheetData.getItem(row, col);
            const value = newValue
              ? this.#cellCodecs?.get(newValue.type)?.rebase?.(newValue, {
                  rowDelta: row - anchor[0],
                  columnDelta: col - anchor[1],
                }) ?? newValue
              : null;
            operations.push(createUpdateCellOTOperation<CellMatrixElement>([row, col], value, oldValue));
          }
        } else operations.push(createUpdateCellOTOperation<CellMatrixElement>(anchor, newValue, prevValue));
        const tx = createSheetTransaction(SheetDataPlugin.pluginKey, operations);
        pipeline.add(SheetCellEditorPipelineStepName.CommitValue, tx);
        if (minimumRowHeight !== undefined) {
          const rowSizes = readSheetRowSizes(this.#data);
          const rows = new Set(operations.map((operation) => operation.p[0]));
          const resize = [...rows].flatMap((row) => {
            const current = rowSizes?.getItem(0, row) ?? 0;
            return minimumRowHeight > current ? [createResizeRowOTOperation([row], minimumRowHeight, current)] : [];
          });
          if (resize.length)
            pipeline.add('expand-multiline-rows', createSheetTransaction(SheetResizePlugin.pluginKey, resize));
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
    const { transaction: cleanupTx } = this.#performCleanup();
    pipeline.add(SheetCellEditorPipelineStepName.ExitEditMode, cleanupTx);
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
  }
  #performCleanup(): { transaction: Transaction } {
    this.assertRuntimeWriteAllowed();
    const empty = createEmptyRectShape();
    return {
      transaction: createSheetTransaction(
        this.pluginKey,
        [0, 1, 2].map((index) => createUpdateRectOTOperation([index], empty[0], empty[1])),
      ),
    };
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
    this.#isEditing = false;
    this.#initialEditSnapshot = null;
    // Ensure drag state is always cleaned up regardless of how editing ended.
    this.#referencePick = null;
    this.#lastPickedReference = null;
    this.#formulaAutoClose.clear();
    this.#formulaAnalysis = null;
    this.#publishFormulaAssist({ suggestions: [], selectedIndex: 0, signature: null, diagnostic: null, anchor: null });

    // Selection mode also receives text, using the same input surface so an
    // in-flight composition survives the transition into cell editing.
    this.#publishFormulaBarState();
  }
  #disposeEmbeddedSession(): void {
    this.#editSession?.dispose();
    this.#editSession = null;
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
    this.#editSession?.setSelection(this.#session.docSelection);
    this.#publishFormulaBarState();
  }
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
