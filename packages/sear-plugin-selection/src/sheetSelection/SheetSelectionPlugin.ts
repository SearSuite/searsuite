import { SearError } from '@searsuite/sear-foundation-error';
import { Pipeline, SearCoreSheet, SheetInteractionReducerRegistry } from '@searsuite/sear-assembly-core';
import { GetActiveCell } from '../GetActiveCell';
import {
  RectOT,
  RectOTActionName,
  MatrixOTActionName,
  createUpdateRectOTOperation,
  isMatrixStructureOperation,
  isResizeColOperation,
  isResizeRowOperation,
  type MatrixStructureOTOperation,
} from '@searsuite/sear-domain-ot';
import {
  Plugin,
  PluginKey,
  SessionStateRegistry,
  SessionStateRestorePhase,
  defineSessionState,
  SheetRangeMoveRegistry,
  SheetRangeMoveStatus,
  SheetRangeMoveRejectedError,
  SheetFormatTransferRegistry,
  type SheetRangeMoveAnalysis,
  type SheetRangeMoveContext,
} from '@searsuite/sear-assembly-plugin';
import { EventWithOffsetAndTarget } from '@searsuite/sear-render-event-engine';
import { ConfigUnit } from '@searsuite/sear-assembly-config';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { KeyboardRouter, PointerCapture, TextInput } from '@searsuite/sear-render-input';
import { getSheetRangePositionRect } from '@searsuite/sear-render';
import { SheetCellMergePlugin } from '@searsuite/sear-plugin-cell-merge';
import { CellType, SheetCellInputValidationRegistry } from '@searsuite/sear-domain-cell-types';
import { readSheetFreeze } from '@searsuite/sear-plugin-freeze';
import { readSheetFixedRows } from '@searsuite/sear-plugin-fixed-row';
import { activeFixedRowOffsets } from '@searsuite/sear-render';
import { Rect as RectRange, Point, createEmptyRect } from '@searsuite/sear-foundation-rect';
import { Platform } from '@searsuite/sear-foundation-platform';
import { Transaction } from '@searsuite/sear-domain-transaction';
import { Node } from '@searsuite/sear-render-node';
import {
  ReadSheetCellDataQuery,
  SheetDataPlugin,
  readSheetColumnSizes,
  readSheetRowVisibility,
  readSheetRowSizes,
  type DataEngine,
  type SheetCellDataReader,
} from '@searsuite/sear-render-engine';
import { type DimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import { type SheetConfig } from '@searsuite/sear-assembly-config';
import { CellProperties, CellRegion, EmptyCell } from '@searsuite/sear-render-registry';
import { SheetHighlightPlugin } from '../sheetHighlight/SheetHighlightPlugin';
import { SheetHighlightRegistry } from '../SheetHighlightRegistry';
import { SheetHighlightPipelineStepName } from '../SheetHighlightPipelineNames';
import { SheetSelectionRenderSemantics } from '../SheetSelectionRenderSemantics';
import {
  SheetSelectionInteractionName,
  SheetSelectionPipelineName,
  SheetSelectionPipelineStepName,
  SheetSelectionSource,
} from '../SheetSelectionPipelineNames';
import { registerSheetSelectionInteractionReducers } from '../SheetSelectionInteractionReducer';
import { MoveSheetRangeCommand, GetSheetRangeMoveConflict, type MoveSheetRangeInput } from '../SheetRangeMoveCommands';
import { resolveSheetRangeMove } from '../resolveSheetRangeMove';
import { AnalyzeSheetRangeMove } from '../AnalyzeSheetRangeMove';
import { SheetRangeMoveError, SheetRangeMoveErrorCode } from '../SheetRangeMoveError';
import { SheetRangeDrag } from '../SheetRangeDrag';
import { FillSheetRangeCommand } from '../SheetFillRangeCommand';
import {
  HandleSheetSelectionPointerCommand,
  SheetSelectionPointerAction,
  type SheetSelectionPointerInput,
} from '../SheetSelectionPointerCommand';
import {
  createSheetTransaction,
  ClearRangeContentsCommand,
  createClearRangeContentsOperations,
  InsertColumnCommand,
  InsertRowCommand,
  type SheetRangeBounds,
  extendSelection,
  LocalActionCommand,
  moveSelection,
  PipelineExecutionCommand,
  TransactionPipelineCommand,
  selectRange,
  SelectionMoveDirection,
  SheetCommandBus,
  type SheetCommandResult,
  SheetQueryRegistry,
} from '@searsuite/sear-assembly-commands';
import {
  EnsureSelectionVisibleCommand,
  ClearSelectedContentsCommand,
  GetSelections,
  GetSelectionNavigation,
  registerSelectionQueries,
  SelectRangeCommand,
  RestartSheetSelectionNavigationCommand,
  SheetAdditionalSelectionMode,
  type SheetSelectRangeInput,
} from '../SheetSelectionCommands';

const key = new PluginKey('SheetSelection');
/** Local selection state retained while remounting one workbook sheet. */
export type SheetSelectionSessionState = readonly [RectRange, RectRange];
/** Stable session-state identity owned by SheetSelectionPlugin. */
export const SheetSelectionSessionStateDefinition = defineSessionState<SheetSelectionSessionState>('sheet.selection');
export const SheetAdditionalSelectionsSessionStateDefinition =
  defineSessionState<readonly RectRange[]>('sheet.selection.additional');
const sheetSelectionPluginConfig = {
  defaultBorderColor: 'rgba(56, 110, 246, 1)',
  // defaultBackgroundColor: 'rgba(0, 120, 215, 0.3)',
};

interface SheetGeometryFields {
  rowSizes: DimensionsCSRMatrix;
  columnSizes: DimensionsCSRMatrix;
}

function readSheetGeometry(dataEngine: DataEngine): SheetGeometryFields | null {
  const rowSizes = readSheetRowSizes(dataEngine);
  const columnSizes = readSheetColumnSizes(dataEngine);
  return rowSizes && columnSizes ? { rowSizes, columnSizes } : null;
}

function selectionPointerInput(
  action: SheetSelectionPointerAction,
  event?: EventWithOffsetAndTarget<CellProperties>,
): SheetSelectionPointerInput {
  const properties = event?.target?.properties;
  const origin = event?.origin;
  return {
    action,
    target: properties
      ? {
          region: properties.region,
          startRowIndex: properties.startRowIndex,
          startColIndex: properties.startColIndex,
          endRowIndex: properties.endRowIndex,
          endColIndex: properties.endColIndex,
        }
      : null,
    ...(typeof origin?.offsetX === 'number' && typeof origin.offsetY === 'number'
      ? { view: { x: origin.offsetX, y: origin.offsetY } }
      : {}),
    shiftKey: Boolean(origin?.shiftKey),
    metaKey: Boolean(origin?.metaKey),
    ctrlKey: Boolean(origin?.ctrlKey),
  };
}

/**
 * Owns the active Sheet range, additional ranges, and selection navigation.
 *
 * Pointer and keyboard input reach this plugin through registered commands.
 * It keeps selection values in editor session state, publishes typed queries
 * and observations for hosts, and contributes the visual highlight. Hosts
 * should use those public contracts instead of reading plugin fields.
 */
@Injectable()
export class SheetSelectionPlugin extends Plugin<SearCoreSheet, CellProperties, [RectRange, RectRange]> {
  /** DI token for resolving SheetSelectionPlugin. */
  public static readonly symbol: symbol = Symbol.for('SheetSelectionPlugin');
  /** Stable plugin key for SheetSelectionPlugin. */
  public static readonly pluginKey = key;

  #isSelecting: boolean = false;
  #selectionPointer: { x: number; y: number } | null = null;
  #selectionScrollFrame: number | null = null;
  #disposeSelectionCapture: (() => void) | null = null;
  #additionalRanges: RectRange[] = [];
  #disposeAdditionalHighlight: (() => void) | null = null;
  #headerDragMode: 'none' | 'row' | 'col' = 'none';
  /** The cell that was originally clicked — used as the fixed anchor for Shift+arrow multi-select. */
  #selectionOrigin: Point | null = null;
  /** The current cursor position during Shift+arrow extension — tracks the moving end independently of the displayed range. */
  #selectionCursor: Point | null = null;
  #commandCore: SearCoreSheet | null = null;
  #core: SearCoreSheet | null = null;
  #queries: SheetQueryRegistry | null = null;
  #commands: SheetCommandBus | undefined;
  readonly #rangeDragOwnerToken = {};
  /** Optional merge capability used to normalize selection movement. */
  readonly #sheetCellMergePlugin: SheetCellMergePlugin;

  /** Returns the plugin config. */
  public getPluginConfig(searCore: SearCoreSheet): null {
    return null;
  }

  /** Creates a SheetSelectionPlugin instance. */
  constructor(
    @Inject(SheetCellMergePlugin.symbol)
    sheetCellMergePlugin: SheetCellMergePlugin,
    @Inject(KeyboardRouter.symbol)
    private readonly keyboardRouter: KeyboardRouter,
    @Inject(Platform.symbol)
    private readonly platform?: Platform,
    @Inject(SheetInteractionReducerRegistry.symbol)
    interactionReducers?: SheetInteractionReducerRegistry,
    @Inject(SheetCommandBus.symbol)
    commands?: SheetCommandBus,
    @Inject(SheetRangeMoveRegistry.symbol)
    private readonly rangeMoves?: SheetRangeMoveRegistry,
    @Inject(SheetRangeDrag.symbol)
    private readonly rangeDrag?: SheetRangeDrag,
    @Inject(SheetHighlightRegistry.symbol)
    private readonly highlights?: SheetHighlightRegistry,
    @Inject(SheetCellInputValidationRegistry.symbol)
    private readonly inputValidation?: SheetCellInputValidationRegistry,
    @Inject(PointerCapture.symbol)
    private readonly pointerCapture?: PointerCapture,
    @Inject(TextInput.symbol)
    private readonly textInput?: TextInput,
    @Inject(SheetFormatTransferRegistry.symbol)
    private readonly formats?: SheetFormatTransferRegistry,
  ) {
    super({
      key: key,
      state: [createEmptyRect(), createEmptyRect()],
    });
    this.#commands = commands;
    this.#sheetCellMergePlugin = sheetCellMergePlugin;
    if (interactionReducers) registerSheetSelectionInteractionReducers(interactionReducers);

    this.subscribeNavigationHandlers();
    this.keyboardRouter.startListener();
  }

  /** Binds this plugin to the core owned by its editor-local container. */
  public bindCore(core: SearCoreSheet): void {
    this.#bindCoreReference(core);
    this.rangeDrag?.bind(core, () => this.getState()[1], this.#rangeDragOwnerToken);
    if (this.highlights && !this.#disposeAdditionalHighlight) {
      this.#disposeAdditionalHighlight = this.highlights.register({
        key: 'sheet.selection.additional',
        getHighlights: () =>
          this.#additionalRanges.map((range) => ({
            start: [...range.getPoint(0)],
            end: [...range.getPoint(1)],
            stroke: sheetSelectionPluginConfig.defaultBorderColor,
            strokeWidth: 2,
            skipHit: true,
            overlay: true,
          })),
      });
    }
  }

  #bindCoreReference(core: SearCoreSheet): void {
    if (this.#core === core) return;
    if (this.hasStateWriteBoundary() && this.#core) {
      throw new SearError('Sheet selection core cannot be replaced after editor assembly.');
    }
    this.#core = core;
  }

  /** Registers the active selection as a typed query rather than a DataEngine field. */
  public registerQueries(queries: SheetQueryRegistry): void {
    this.assertRuntimeWriteAllowed();
    if (this.#queries && this.#queries !== queries) {
      throw new SearError('Sheet selection queries are already bound to an editor.');
    }
    this.#queries = queries;
    if (this.rangeMoves) {
      queries.register(AnalyzeSheetRangeMove, (input) => this.analyzeRangeMove(input));
      queries.register(GetSheetRangeMoveConflict, (input) => {
        const analysis = this.analyzeRangeMove(input);
        if (analysis.status === SheetRangeMoveStatus.Blocked) throw new SheetRangeMoveRejectedError(analysis);
        return analysis.status === SheetRangeMoveStatus.RequiresConfirmation;
      });
    }
    queries.register(GetActiveCell, () => {
      const point = this.getState()[0].getPoint(0);
      return point[0] < 0 || point[1] < 0 ? null : ([...point] as Point);
    });
    registerSelectionQueries(queries, () => {
      const selection = this.getState();
      const start = selection[1].getPoint(0);
      const end = selection[1].getPoint(1);
      if (start[0] < 0 || start[1] < 0 || end[0] < 0 || end[1] < 0) return null;
      return { start: [...start], end: [...end] } satisfies SheetRangeBounds;
    });
    queries.register(GetSelections, () => {
      const ranges = [...this.#additionalRanges, this.getState()[1]];
      return ranges
        .filter((range) => range.getPoint(0)[0] >= 0)
        .map((range) => ({
          start: [...range.getPoint(0)] as Point,
          end: [...range.getPoint(1)] as Point,
        }));
    });
    queries.register(GetSelectionNavigation, () => ({
      origin: this.#selectionOrigin ? ([...this.#selectionOrigin] as Point) : null,
      cursor: this.#selectionCursor ? ([...this.#selectionCursor] as Point) : null,
    }));
  }

  /** Registers selection-owned local remount state. */
  public registerSessionState(registry: SessionStateRegistry): void {
    this.registerOwnedSessionState(registry, () => {
      registry.register(SheetSelectionSessionStateDefinition, {
        restorePhase: SessionStateRestorePhase.BeforeInitialize,
        capture: this.#captureSessionState.bind(this),
        restore: (selection) => {
          SessionStateRegistry.prototype.assertRestorationOpen.call(registry);
          this.#restoreSessionState(selection);
        },
      });
      registry.register(SheetAdditionalSelectionsSessionStateDefinition, {
        restorePhase: SessionStateRestorePhase.BeforeInitialize,
        capture: () => this.#additionalRanges.map((range) => range.clone()),
        restore: (ranges) => {
          SessionStateRegistry.prototype.assertRestorationOpen.call(registry);
          this.#additionalRanges = ranges.map((range) => range.clone());
          this.highlights?.invalidate();
        },
      });
    });
  }

  #captureSessionState(): [RectRange, RectRange] {
    const state = this.getState();
    return [state[0].clone(), state[1].clone()];
  }

  #restoreSessionState(selection: SheetSelectionSessionState): void {
    const next: [RectRange, RectRange] = [selection[0].clone(), selection[1].clone()];
    this.setState(next);
    const focus = next[1].getPoint(1);
    this.#selectionOrigin = focus[0] < 0 ? null : [...focus];
    this.#selectionCursor = focus[0] < 0 ? null : [...focus];
  }

  private requireCore(): SearCoreSheet {
    if (!this.#core) throw new SearError('SheetSelectionPlugin is not bound to a Sheet editor core.');
    return this.#core;
  }

  /** @inheritdoc */
  public override depth: number = -1;

  /** @inheritdoc */
  public override interestedIn = [
    MatrixOTActionName.ResizeRow,
    MatrixOTActionName.ResizeCol,
    MatrixOTActionName.RowInsert,
    MatrixOTActionName.RowDelete,
    MatrixOTActionName.RowMove,
    MatrixOTActionName.ColInsert,
    MatrixOTActionName.ColDelete,
    MatrixOTActionName.ColMove,
  ];

  /** Returns whether in merged cell. */
  public isInMergedCell(rangeRect: RectRange) {
    loop: for (let rowIndex = rangeRect.getPoint(0)[0]; rowIndex <= rangeRect.getPoint(1)[0]; rowIndex++) {
      for (let colIndex = rangeRect.getPoint(0)[1]; colIndex <= rangeRect.getPoint(1)[1]; colIndex++) {
        const mergedCell = this.#sheetCellMergePlugin.isMergedCell(rowIndex, colIndex);
        if (mergedCell && !RectRange.contains(rangeRect, mergedCell)) return mergedCell;
      }
    }
    return null;
  }

  /** Handles the dbl click lifecycle event. */
  public onDblClick(searCore: SearCoreSheet, event: EventWithOffsetAndTarget<CellProperties>): boolean | void {
    if (this.onFillHandleDoubleClick(event)) return false;
    // Double-click selection behavior intentionally mirrors `onMouseDown`.
    // `mouseDown` already updates anchor/focus before `dblClick` fires.
    // SheetCellEditorPlugin may consume `dblClick` by returning `false`; this path remains as fallback.
    return this.onMouseDown(searCore, event);
  }

  /** Lets the editor distinguish the fill handle from a cell-body double click. */
  public onFillHandleDoubleClick(event: EventWithOffsetAndTarget<CellProperties>): boolean {
    return this.rangeDrag?.onFillHandleDoubleClick(event) ?? false;
  }

  /** Handles the mouse down lifecycle event. */
  public onMouseDown(searCore: SearCoreSheet, event: EventWithOffsetAndTarget<CellProperties>): boolean | void {
    if (event.target?.properties.region === CellRegion.Corner && (event.origin?.button ?? 0) !== 0) return;
    if (event.origin?.button === 2 && event.target) {
      const { region, startRowIndex, startColIndex } = event.target.properties;
      const range = this.getState()[1];
      const start = range.getPoint(0);
      const end = range.getPoint(1);
      const insideRows = startRowIndex !== void 0 && startRowIndex >= start[0] && startRowIndex <= end[0];
      const inside =
        region === CellRegion.Grid
          ? insideRows && startColIndex !== void 0 && startColIndex >= start[1] && startColIndex <= end[1]
          : region === CellRegion.RowHeader &&
            insideRows &&
            start[1] === 0 &&
            end[1] === (readSheetGeometry(searCore.getDataEngine())?.columnSizes.shape[1] ?? 0) - 1;
      if (inside) return false;
    }
    const additive = Boolean(
      (event.origin?.metaKey || event.origin?.ctrlKey) && event.target?.properties.region === CellRegion.Grid,
    );
    if (!additive && this.rangeDrag?.onMouseDown(event)) return false;
    return this.#dispatchPointerInput(searCore, selectionPointerInput(SheetSelectionPointerAction.Down, event));
  }

  #dispatchPointerInput(searCore: SearCoreSheet, input: SheetSelectionPointerInput): boolean | void {
    if (!this.hasStateWriteBoundary()) return this.#applyPointerInput(searCore, input);
    if (!this.#commands) throw new SearError('Sheet selection pointer command is unavailable.');
    this.#commands.run(HandleSheetSelectionPointerCommand, input);
  }

  #applyPointerInput(searCore: SearCoreSheet, input: SheetSelectionPointerInput): boolean | void {
    switch (input.action) {
      case SheetSelectionPointerAction.Down:
        return this.#handlePointerDown(searCore, input);
      case SheetSelectionPointerAction.Move:
        return this.#handlePointerMove(searCore, input);
      case SheetSelectionPointerAction.Up:
        this.#handlePointerUp();
        return;
      case SheetSelectionPointerAction.Tick:
        this.#selectionScrollFrame = null;
        this.advanceSelectionScroll();
    }
  }

  #handlePointerDown(searCore: SearCoreSheet, input: SheetSelectionPointerInput): void {
    const target = input.target;

    if (!target) throw new SearError('SheetSelectionPlugin onMouseDown event target is null');

    const properties = target;
    const additive = Boolean((input.metaKey || input.ctrlKey) && properties.region === CellRegion.Grid);

    const { startRowIndex, startColIndex } = properties;
    const { endRowIndex, endColIndex } = properties;

    const region = properties.region;
    if (region === CellRegion.Corner) {
      const geometry = readSheetGeometry(searCore.getDataEngine());
      if (!geometry || !geometry.rowSizes.shape[1] || !geometry.columnSizes.shape[1]) return;
      const first: Point = [0, 0];
      this.executeSelectionCommand(
        searCore,
        first,
        [geometry.rowSizes.shape[1] - 1, geometry.columnSizes.shape[1] - 1],
        SheetSelectionSource.Pointer,
        false,
        first,
        first,
        SheetAdditionalSelectionMode.Clear,
      );
      return;
    }
    if (region === CellRegion.RowHeader) {
      if (!Number.isSafeInteger(startRowIndex) || !Number.isSafeInteger(endRowIndex ?? startRowIndex)) return;
    } else if (region === CellRegion.ColumnHeader) {
      if (!Number.isSafeInteger(startColIndex) || !Number.isSafeInteger(endColIndex ?? startColIndex)) return;
    } else if (![startRowIndex, startColIndex, endRowIndex, endColIndex].every(Number.isSafeInteger)) {
      return;
    }
    const dataEngine = searCore.getDataEngine();
    const dataState = readSheetGeometry(dataEngine);

    let anchor: Point;
    let focus: Point;

    if (region === CellRegion.RowHeader && startRowIndex !== void 0) {
      if (!dataState) {
        this.platform?.warn(
          'SheetSelectionPlugin onMouseDown row-header selection skipped: sheet geometry fields are missing.',
        );
        return;
      }
      const lastCol = dataState.columnSizes.shape[1] - 1;
      anchor = [startRowIndex, 0];
      focus = [endRowIndex ?? startRowIndex, lastCol];
      this.#headerDragMode = 'row';
    } else if (region === CellRegion.ColumnHeader && startColIndex !== void 0) {
      if (!dataState) {
        this.platform?.warn(
          'SheetSelectionPlugin onMouseDown column-header selection skipped: sheet geometry fields are missing.',
        );
        return;
      }
      const lastRow = dataState.rowSizes.shape[1] - 1;
      anchor = [0, startColIndex];
      focus = [lastRow, endColIndex ?? startColIndex];
      this.#headerDragMode = 'col';
    } else if (input.shiftKey && this.#selectionOrigin && region === CellRegion.Grid) {
      anchor = [...this.#selectionOrigin];
      focus = [Number(endRowIndex), Number(endColIndex)];
      this.#headerDragMode = 'none';
    } else {
      anchor = [Number(startRowIndex), Number(startColIndex)];
      focus = [Number(endRowIndex), Number(endColIndex)];
      this.#headerDragMode = 'none';
    }

    const normalized = selectRange({
      start: anchor,
      end: focus,
      findMerge: this.findMergedSelectionRange.bind(this),
      lastRow: dataState ? dataState.rowSizes.shape[1] - 1 : void 0,
      lastCol: dataState ? dataState.columnSizes.shape[1] - 1 : void 0,
    });
    anchor = normalized.anchor;
    focus = normalized.focus;

    const additionalSelectionMode = additive
      ? SheetAdditionalSelectionMode.AppendCurrent
      : input.shiftKey
      ? SheetAdditionalSelectionMode.Preserve
      : SheetAdditionalSelectionMode.Clear;

    // Keep the original anchor when extending a selection with Shift+click.
    const extendingFromPointer = Boolean(input.shiftKey && this.#selectionOrigin && region === CellRegion.Grid);
    const navigationOrigin = extendingFromPointer ? this.#selectionOrigin! : focus;

    if (extendingFromPointer) {
      this.executeSelectionCommand(
        searCore,
        anchor,
        focus,
        SheetSelectionSource.Pointer,
        false,
        navigationOrigin,
        focus,
        additionalSelectionMode,
        { origin: navigationOrigin, cursor: focus },
      );
    } else {
      this.executeSelectionCommand(
        searCore,
        anchor,
        focus,
        SheetSelectionSource.Pointer,
        false,
        void 0,
        void 0,
        additionalSelectionMode,
        { origin: navigationOrigin, cursor: focus },
      );
    }
    this.#isSelecting = true;
    this.#disposeSelectionCapture?.();
    this.#disposeSelectionCapture = this.pointerCapture?.start({
      onRelease: () => {
        if (!this.#isSelecting) return;
        this.#dispatchPointerInput(searCore, selectionPointerInput(SheetSelectionPointerAction.Up));
        this.textInput?.startListener();
        this.textInput?.refocus();
      },
    }) ?? null;
  }

  /** Handles the mouse move lifecycle event. */
  public onMouseMove(searCore: SearCoreSheet, event: EventWithOffsetAndTarget<CellProperties>): boolean | void {
    if (this.rangeDrag?.isActive()) return false;
    if (!this.#isSelecting) return;
    return this.#dispatchPointerInput(searCore, selectionPointerInput(SheetSelectionPointerAction.Move, event));
  }

  #handlePointerMove(searCore: SearCoreSheet, input: SheetSelectionPointerInput): void {
    this.#updatePointerPosition(input.view);
    const plan = this.#planPointerMove(searCore, input);
    if (!plan) return;
    this.executeSelectionCommand(
      searCore,
      plan.anchor,
      plan.focus,
      SheetSelectionSource.Pointer,
      false,
      plan.activeAnchor,
      plan.activeFocus,
      void 0,
      plan.navigation,
    );
  }

  #updatePointerPosition(view: SheetSelectionPointerInput['view']): void {
    if (!view) return;
    this.#selectionPointer = { x: view.x, y: view.y };
    this.scheduleSelectionScroll();
  }

  #planPointerMove(searCore: SearCoreSheet, input: SheetSelectionPointerInput): SheetSelectRangeInput | null {
    const target = input.target;
    if (!target) {
      this.platform?.warn('SheetSelectionPlugin onMouseMove event target is null');
      return null;
    }

    const properties = target;
    const { startRowIndex, startColIndex } = properties;
    const { endRowIndex, endColIndex } = properties;

    if (startRowIndex === void 0 || startColIndex === void 0 || endRowIndex === void 0 || endColIndex === void 0) {
      this.platform?.warn('SheetSelectionPlugin onMouseMove target properties is missing ExcelNodeProperties');
      return null;
    }
    const dataEngine = searCore.getDataEngine();
    const state = dataEngine.getDataType<[RectRange, RectRange]>(this.pluginKey);
    if (!state) {
      this.platform?.warn('SheetSelectionPlugin onMouseMove selection state is not found');
      return null;
    }

    const dataState = readSheetGeometry(dataEngine);
    if (!dataState) return null;

    const anchor = state[0].getPoint(0);
    const focus = state[0].getPoint(1);

    let currentAnchor: [number, number];
    let currentFocus: [number, number];

    if (this.#headerDragMode === 'row') {
      const lastCol = dataState.columnSizes.shape[1] - 1;
      const currentRow = Number(startRowIndex);
      const rowStart = Math.min(anchor[0], currentRow);
      const rowEnd = Math.max(anchor[0], currentRow);
      currentAnchor = [rowStart, 0];
      currentFocus = [rowEnd, lastCol];
    } else if (this.#headerDragMode === 'col') {
      const lastRow = dataState.rowSizes.shape[1] - 1;
      const currentCol = Number(startColIndex);
      const colStart = Math.min(anchor[1], currentCol);
      const colEnd = Math.max(anchor[1], currentCol);
      currentAnchor = [0, colStart];
      currentFocus = [lastRow, colEnd];
    } else {
      currentAnchor = [Number(startRowIndex), Number(startColIndex)];
      currentFocus = [Number(endRowIndex), Number(endColIndex)];
    }

    let anchorNode: [number, number];
    let focusNode: [number, number];

    if (this.#headerDragMode !== 'none') {
      anchorNode = currentAnchor;
      focusNode = currentFocus;
    } else {
      const boundingRect = RectRange.findBoundingRectangle([
        new RectRange([anchor, focus]),
        new RectRange([currentAnchor, currentFocus]),
      ]);

      anchorNode = boundingRect.getPoint(0);
      focusNode = boundingRect.getPoint(1);

      let mergedCell = this.isInMergedCell(new RectRange(boundingRect.shape));

      let times = 0;
      while (mergedCell) {
        times++;
        const boundingRect = RectRange.findBoundingRectangle([new RectRange([anchorNode, focusNode]), mergedCell]);
        anchorNode = boundingRect.getPoint(0);
        focusNode = boundingRect.getPoint(1);

        mergedCell = this.isInMergedCell(new RectRange(boundingRect.shape));
        if (times > 1000) break;
      }
    }
    return {
      anchor: anchorNode,
      focus: focusNode,
      source: SheetSelectionSource.Pointer,
      ensureVisible: false,
      activeAnchor: anchor,
      activeFocus: currentFocus,
      navigation: { origin: this.#selectionOrigin ?? anchor, cursor: focusNode },
    };
  }

  /** Handles the mouse up lifecycle event. */
  public onMouseUp(_searCore: SearCoreSheet, _event: EventWithOffsetAndTarget<CellProperties>): boolean | void {
    if (!this.#isSelecting && this.#selectionScrollFrame === null) return;
    return this.#dispatchPointerInput(_searCore, selectionPointerInput(SheetSelectionPointerAction.Up));
  }

  #handlePointerUp(): void {
    this.#isSelecting = false;
    this.#disposeSelectionCapture?.();
    this.#disposeSelectionCapture = null;
    this.#selectionPointer = null;
    if (this.#selectionScrollFrame !== null) this.platform?.cancelAnimationFrame(this.#selectionScrollFrame);
    this.#selectionScrollFrame = null;
    this.#headerDragMode = 'none';
  }

  private scheduleSelectionScroll(): void {
    if (!this.platform || this.#selectionScrollFrame !== null || !this.#selectionPointer) return;
    this.#selectionScrollFrame = this.platform.requestAnimationFrame(() => {
      if (this.hasStateWriteBoundary()) {
        if (!this.#commands) throw new SearError('Sheet selection pointer command is unavailable.');
        this.#commands.run(HandleSheetSelectionPointerCommand, {
          action: SheetSelectionPointerAction.Tick,
        });
      } else {
        this.#selectionScrollFrame = null;
        this.advanceSelectionScroll();
      }
    });
  }

  private advanceSelectionScroll(): void {
    if (!this.#isSelecting || !this.#selectionPointer) return;
    const core = this.requireCore();
    const geometry = readSheetGeometry(core.getDataEngine());
    if (!geometry) return;
    const scroll = core.renderEngine.scrollManager;
    const [width, height] = scroll.getShape();
    const config = core.configEngine.getDefaultConfig() as Partial<SheetConfig>;
    const xOffset = config.sheetOffsetX ?? 50;
    const yOffset = config.sheetOffsetY ?? 24;
    const pointer = this.#selectionPointer;
    const speed = (position: number, start: number, end: number) =>
      position < start + 24 ? -12 : position > end - 24 ? 12 : 0;
    const dx = this.#headerDragMode === 'row' ? 0 : speed(pointer.x, xOffset, width);
    const dy = this.#headerDragMode === 'col' ? 0 : speed(pointer.y, yOffset, height);
    if (!dx && !dy) return;
    const before = scroll.getState();
    scroll.requestScrollTo(before.x + dx, before.y + dy);
    const after = scroll.getState();
    if (after.x === before.x && after.y === before.y) return;
    {
      const rowPosition = after.y + Math.max(0, Math.min(height - yOffset - 1, pointer.y - yOffset));
      const colPosition = after.x + Math.max(0, Math.min(width - xOffset - 1, pointer.x - xOffset));
      const row = Math.min(
        geometry.rowSizes.shape[1] - 1,
        geometry.rowSizes.getLeftBoundaryColIndexByDimension(rowPosition),
      );
      const col = Math.min(
        geometry.columnSizes.shape[1] - 1,
        geometry.columnSizes.getLeftBoundaryColIndexByDimension(colPosition),
      );
      const anchor = this.#selectionOrigin ?? this.getState()[0].getPoint(0);
      const end: Point =
        this.#headerDragMode === 'row'
          ? [row, geometry.columnSizes.shape[1] - 1]
          : this.#headerDragMode === 'col'
          ? [geometry.rowSizes.shape[1] - 1, col]
          : [row, col];
      const start: Point =
        this.#headerDragMode === 'row' ? [anchor[0], 0] : this.#headerDragMode === 'col' ? [0, anchor[1]] : [...anchor];
      this.executeSelectionCommand(core, start, end, SheetSelectionSource.Pointer, false, start, end, void 0, {
        origin: this.#selectionOrigin ?? start,
        cursor: end,
      });
    }
    this.scheduleSelectionScroll();
  }

  private findMergedSelectionRange(point: readonly [number, number]): { start: Point; end: Point } | undefined {
    const merge = this.#sheetCellMergePlugin.isMergedCell(point[0], point[1]);
    return merge ? { start: merge.getPoint(0), end: merge.getPoint(1) } : void 0;
  }

  // ─── Arrow / Enter key navigation ────────────────────────────────────────

  private subscribeNavigationHandlers(): void {
    this.keyboardRouter.subscribe({
      onDelete: this.handleSelectionDeleteKey.bind(this),
      onSelectAll: this.handleSelectionSelectAllKey.bind(this),
      onHome: this.handleSelectionHomeKey.bind(this),
      onEnd: this.handleSelectionEndKey.bind(this),
      onPage: this.handleSelectionPageKey.bind(this),
      onHorizontalPage: this.handleSelectionHorizontalPageKey.bind(this),
      onSelectRow: this.handleSelectionSelectRowKey.bind(this),
      onSelectColumn: this.handleSelectionSelectColumnKey.bind(this),
      onEnter: this.handleSelectionEnterKey.bind(this),
      onArrowDown: this.handleSelectionArrowDown.bind(this),
      onArrowUp: this.handleSelectionArrowUp.bind(this),
      onArrowLeft: this.handleSelectionArrowLeft.bind(this),
      onArrowRight: this.handleSelectionArrowRight.bind(this),
      onTab: this.handleSelectionTabKey.bind(this),
      onFillDown: () => this.fillSelectionFromEdge('down'),
      onFillRight: () => this.fillSelectionFromEdge('right'),
      onCopyFormulaAbove: () => this.copyFormulaFromAbove(),
    });
  }

  private fillSelectionFromEdge(direction: 'down' | 'right'): void {
    if (this.#additionalRanges.length) return;
    const range = this.getState()[1];
    const anchor = range.getPoint(0);
    const focus = range.getPoint(1);
    if (anchor[0] < 0 || anchor[1] < 0) return;
    const top = Math.min(anchor[0], focus[0]);
    const bottom = Math.max(anchor[0], focus[0]);
    const left = Math.min(anchor[1], focus[1]);
    const right = Math.max(anchor[1], focus[1]);
    if (direction === 'down' && top === bottom) return;
    if (direction === 'right' && left === right) return;
    this.#commands?.run(FillSheetRangeCommand, {
      source: direction === 'down'
        ? { start: [top, left], end: [top, right] }
        : { start: [top, left], end: [bottom, left] },
      target: [bottom, right],
    });
  }

  private copyFormulaFromAbove(): void {
    if (this.#additionalRanges.length) return;
    const range = this.getState()[1];
    const cell = range.getPoint(0);
    if (cell[0] <= 0 || cell[1] < 0 || cell.some((value, index) => value !== range.getPoint(1)[index])) return;
    if (this.readCells()?.getItem(cell[0] - 1, cell[1])?.type !== CellType.Formula) return;
    const above: [number, number] = [cell[0] - 1, cell[1]];
    this.#commands?.run(FillSheetRangeCommand, {
      source: { start: above, end: above }, target: cell, mode: 'exact',
    });
  }

  private handleSelectionDeleteKey(): void {
    if (this.#additionalRanges.length) {
      this.#commands?.run(ClearSelectedContentsCommand, void 0);
      return;
    }
    const range = this.getState()[1];
    const anchor = range.getPoint(0);
    const focus = range.getPoint(1);
    if (anchor[0] < 0 || focus[0] < 0) return;
    this.#commands?.run(ClearRangeContentsCommand, { anchor, focus });
  }

  private handleSelectionSelectAllKey(): void {
    const core = this.requireCore();
    const geometry = readSheetGeometry(core.getDataEngine());
    if (!geometry || geometry.rowSizes.shape[1] === 0 || geometry.columnSizes.shape[1] === 0) return;
    const current = this.getState();
    const active = current[0].getPoint(0);
    const cells = this.readCells();
    const occupied = (row: number, col: number): boolean => {
      const cell = cells?.getItem(row, col);
      return cell != null && (cell.value != null || Boolean(cell.formula));
    };
    const rowHasData = (row: number, left: number, right: number): boolean => {
      for (let col = left; col <= right; col++) if (occupied(row, col)) return true;
      return false;
    };
    const columnHasData = (col: number, top: number, bottom: number): boolean => {
      for (let row = top; row <= bottom; row++) if (occupied(row, col)) return true;
      return false;
    };
    if (active[0] >= 0 && occupied(active[0], active[1])) {
      let top = active[0];
      let bottom = top;
      let left = active[1];
      let right = left;
      let expanded: boolean;
      do {
        expanded = false;
        if (top > 0 && rowHasData(top - 1, left, right)) {
          top--;
          expanded = true;
        }
        if (bottom < geometry.rowSizes.shape[1] - 1 && rowHasData(bottom + 1, left, right)) {
          bottom++;
          expanded = true;
        }
        if (left > 0 && columnHasData(left - 1, top, bottom)) {
          left--;
          expanded = true;
        }
        if (right < geometry.columnSizes.shape[1] - 1 && columnHasData(right + 1, top, bottom)) {
          right++;
          expanded = true;
        }
      } while (expanded);
      const selectedStart = current[1].getPoint(0);
      const selectedEnd = current[1].getPoint(1);
      if (
        (top !== bottom || left !== right) &&
        (selectedStart[0] !== top || selectedStart[1] !== left || selectedEnd[0] !== bottom || selectedEnd[1] !== right)
      ) {
        this.executeSelectionCommand(core, [top, left], [bottom, right], SheetSelectionSource.Keyboard);
        return;
      }
    }
    this.executeSelectionCommand(
      core,
      [0, 0],
      [geometry.rowSizes.shape[1] - 1, geometry.columnSizes.shape[1] - 1],
      SheetSelectionSource.Keyboard,
    );
  }

  private handleSelectionHomeKey(primaryModifier: boolean, shiftKey: boolean): void {
    const cell = shiftKey ? this.#selectionCursor ?? this.getState()[0].getPoint(0) : this.getState()[0].getPoint(0);
    if (cell[0] < 0) return;
    const target: Point = [primaryModifier ? 0 : cell[0], 0];
    this.selectNavigationTarget(target, shiftKey);
  }

  private readCells(): SheetCellDataReader | null {
    return this.#queries?.has(ReadSheetCellDataQuery) ? this.#queries.run(ReadSheetCellDataQuery, void 0) : null;
  }

  private handleSelectionEndKey(shiftKey: boolean): void {
    const cells = this.readCells();
    if (!cells?.forEachStoredInRange || cells.shape[0] === 0 || cells.shape[1] === 0) return;
    let row = 0;
    let col = 0;
    cells.forEachStoredInRange(0, 0, cells.shape[0] - 1, cells.shape[1] - 1, (cell, cellRow, cellCol) => {
      if (cell.value == null && !cell.formula) return;
      row = Math.max(row, cellRow);
      col = Math.max(col, cellCol);
    });
    const formatted = this.formats?.usedExtent(cells.shape[0] - 1, cells.shape[1] - 1);
    if (formatted) {
      row = Math.max(row, formatted[0]);
      col = Math.max(col, formatted[1]);
    }
    const target: Point = [row, col];
    this.selectNavigationTarget(target, shiftKey);
  }

  private handleSelectionPageKey(direction: -1 | 1, shiftKey: boolean): void {
    const core = this.requireCore();
    const geometry = readSheetGeometry(core.getDataEngine());
    const cell = shiftKey ? this.#selectionCursor ?? this.getState()[0].getPoint(0) : this.getState()[0].getPoint(0);
    if (!geometry || cell[0] < 0) return;
    const rows = geometry.rowSizes;
    const scrollManager = core.renderEngine.scrollManager;
    const viewportHeight = scrollManager.getShape()[1];
    const scroll = scrollManager.getState();
    const sheetOffset = (core.configEngine.getDefaultConfig() as Partial<SheetConfig>).sheetOffsetY ?? 24;
    const currentTop = rows.getDimensionLeftBoundaryByIndex(cell[0]);
    const pageSize = Math.max(1, viewportHeight - sheetOffset);
    const targetOffset = Math.max(0, currentTop + direction * pageSize);
    const row = Math.max(0, Math.min(rows.shape[1] - 1, rows.getLeftBoundaryColIndexByDimension(targetOffset)));
    const target: Point = [row, cell[1]];
    this.selectNavigationTarget(target, shiftKey);
    scrollManager.requestScrollTo(scroll.x, Math.max(0, scroll.y + direction * pageSize));
  }

  private handleSelectionHorizontalPageKey(direction: -1 | 1, shiftKey: boolean): void {
    const core = this.requireCore();
    const geometry = readSheetGeometry(core.getDataEngine());
    const cell = shiftKey ? this.#selectionCursor ?? this.getState()[0].getPoint(0) : this.getState()[0].getPoint(0);
    if (!geometry || cell[1] < 0) return;
    const scrollManager = core.renderEngine.scrollManager;
    const scroll = scrollManager.getState();
    const sheetOffset = (core.configEngine.getDefaultConfig() as Partial<SheetConfig>).sheetOffsetX ?? 50;
    const pageSize = Math.max(1, scrollManager.getShape()[0] - sheetOffset);
    const columns = geometry.columnSizes;
    const currentLeft = columns.getDimensionLeftBoundaryByIndex(cell[1]);
    const targetOffset = Math.max(0, currentLeft + direction * pageSize);
    const col = Math.max(0, Math.min(columns.shape[1] - 1, columns.getLeftBoundaryColIndexByDimension(targetOffset)));
    this.selectNavigationTarget([cell[0], col], shiftKey);
    scrollManager.requestScrollTo(Math.max(0, scroll.x + direction * pageSize), scroll.y);
  }

  private selectNavigationTarget(target: Point, extend: boolean): void {
    const core = this.requireCore();
    if (!extend) {
      this.executeSelectionCommand(core, target, target, SheetSelectionSource.Keyboard, true);
      return;
    }
    const origin = this.#selectionOrigin ?? this.getState()[0].getPoint(0);
    const anchor: Point = [Math.min(origin[0], target[0]), Math.min(origin[1], target[1])];
    const focus: Point = [Math.max(origin[0], target[0]), Math.max(origin[1], target[1])];
    this.executeSelectionCommand(core, anchor, focus, SheetSelectionSource.Keyboard, true, anchor, anchor, void 0, {
      origin,
      cursor: target,
    });
  }

  private findDataBoundary(
    cells: SheetCellDataReader,
    current: Point,
    direction: (typeof SelectionMoveDirection)[keyof typeof SelectionMoveDirection],
    lastRow: number,
    lastCol: number,
  ): Point {
    if (!cells.forEachStoredInRange) return current;
    const vertical = direction === SelectionMoveDirection.Up || direction === SelectionMoveDirection.Down;
    const positive = direction === SelectionMoveDirection.Down || direction === SelectionMoveDirection.Right;
    const coordinate = vertical ? current[0] : current[1];
    const limit = vertical ? lastRow : lastCol;
    const currentCell = cells.getItem(current[0], current[1]);
    const occupied = currentCell != null && (currentCell.value != null || Boolean(currentCell.formula));
    const occupiedIndices = new Set<number>();
    const visit = (cell: NonNullable<ReturnType<SheetCellDataReader['getItem']>>, row: number, col: number): void => {
      if (cell.value == null && !cell.formula) return;
      occupiedIndices.add(vertical ? row : col);
    };
    if (vertical) cells.forEachStoredInRange(0, current[1], lastRow, current[1], visit);
    else cells.forEachStoredInRange(current[0], 0, current[0], lastCol, visit);
    const step = positive ? 1 : -1;
    let target = positive ? limit : 0;
    if (occupied && occupiedIndices.has(coordinate + step)) {
      target = coordinate + step;
      while (occupiedIndices.has(target + step)) target += step;
    } else {
      for (const index of occupiedIndices) {
        if (positive && index > coordinate && index < target) target = index;
        if (!positive && index < coordinate && index > target) target = index;
      }
    }
    return vertical ? [target, current[1]] : [current[0], target];
  }

  private handleSelectionSelectRowKey(): void {
    const core = this.requireCore();
    const range = this.getState()[1];
    const start = range.getPoint(0);
    const end = range.getPoint(1);
    const geometry = readSheetGeometry(core.getDataEngine());
    if (start[0] < 0 || !geometry) return;
    this.executeSelectionCommand(
      core,
      [start[0], 0],
      [end[0], geometry.columnSizes.shape[1] - 1],
      SheetSelectionSource.Keyboard,
    );
  }

  private handleSelectionSelectColumnKey(): void {
    const core = this.requireCore();
    const cell = this.getState()[0].getPoint(0);
    const geometry = readSheetGeometry(core.getDataEngine());
    if (cell[1] < 0 || !geometry) return;
    this.executeSelectionCommand(
      core,
      [0, cell[1]],
      [geometry.rowSizes.shape[1] - 1, cell[1]],
      SheetSelectionSource.Keyboard,
    );
  }

  private handleSelectionEnterKey(shiftKey: boolean): void {
    const state = this.getState();
    const start = state[1].getPoint(0);
    const end = state[1].getPoint(1);
    if (start[0] >= 0 && (start[0] !== end[0] || start[1] !== end[1])) {
      const active = state[0].getPoint(0);
      let row = active[0] + (shiftKey ? -1 : 1);
      let col = active[1];
      if (row > end[0]) {
        row = start[0];
        col = col < end[1] ? col + 1 : start[1];
      } else if (row < start[0]) {
        row = end[0];
        col = col > start[1] ? col - 1 : end[1];
      }
      const target: Point = [row, col];
      this.executeSelectionCommand(
        this.requireCore(),
        [...start],
        [...end],
        SheetSelectionSource.Keyboard,
        false,
        target,
        target,
      );
      return;
    }
    if (!shiftKey) this.extendForDownwardEntry();
    this.navigate(shiftKey ? SelectionMoveDirection.Up : SelectionMoveDirection.Down);
  }

  /** Returns the destination row when Enter requires a structural extension. */
  public getDownwardEntryExtensionIndex(): number | null {
    const core = this.requireCore();
    const geometry = readSheetGeometry(core.getDataEngine());
    const row = this.getState()[0].getPoint(0)[0];
    const lastRow = (geometry?.rowSizes.shape[1] ?? 0) - 1;
    return row >= 0 && row === lastRow && this.#commands?.has(InsertRowCommand) ? lastRow + 1 : null;
  }

  /** Adds a destination row only when Enter would otherwise keep the active cell in place. */
  public extendForDownwardEntry(historyGroup?: SheetCommandResult['historyGroup']): void {
    const index = this.getDownwardEntryExtensionIndex();
    if (index !== null) this.#commands?.run(InsertRowCommand, { index, historyGroup });
  }

  private handleSelectionArrowDown(shiftKey: boolean, metaKey: boolean): void {
    this.navigate(SelectionMoveDirection.Down, shiftKey, metaKey);
  }

  private handleSelectionArrowUp(shiftKey: boolean, metaKey: boolean): void {
    this.navigate(SelectionMoveDirection.Up, shiftKey, metaKey);
  }

  private handleSelectionArrowLeft(shiftKey: boolean, metaKey: boolean): void {
    this.navigate(SelectionMoveDirection.Left, shiftKey, metaKey);
  }

  private handleSelectionArrowRight(shiftKey: boolean, metaKey: boolean): void {
    this.navigate(SelectionMoveDirection.Right, shiftKey, metaKey);
  }

  private handleSelectionTabKey(shiftKey: boolean): void {
    const state = this.getState();
    const start = state[1].getPoint(0);
    const end = state[1].getPoint(1);
    if (start[0] < 0) return;
    const merge = this.findMergedSelectionRange(start);
    const singleMergedCell =
      merge &&
      merge.start[0] === start[0] &&
      merge.start[1] === start[1] &&
      merge.end[0] === end[0] &&
      merge.end[1] === end[1];
    if ((start[0] === end[0] && start[1] === end[1]) || singleMergedCell) {
      if (!shiftKey) this.extendForRightwardEntry();
      this.navigate(shiftKey ? SelectionMoveDirection.Left : SelectionMoveDirection.Right);
      return;
    }
    const active = state[0].getPoint(0);
    let row = active[0];
    let col = active[1] + (shiftKey ? -1 : 1);
    if (col > end[1]) {
      col = start[1];
      row = row < end[0] ? row + 1 : start[0];
    } else if (col < start[1]) {
      col = end[1];
      row = row > start[0] ? row - 1 : end[0];
    }
    const target: Point = [row, col];
    this.executeSelectionCommand(
      this.requireCore(),
      [...start],
      [...end],
      SheetSelectionSource.Keyboard,
      false,
      target,
      target,
    );
  }

  /** Returns the destination column when Tab requires a structural extension. */
  public getRightwardEntryExtensionIndex(): number | null {
    const core = this.requireCore();
    const geometry = readSheetGeometry(core.getDataEngine());
    const col = this.getState()[0].getPoint(0)[1];
    const lastCol = (geometry?.columnSizes.shape[1] ?? 0) - 1;
    return col >= 0 && col === lastCol && this.#commands?.has(InsertColumnCommand) ? lastCol + 1 : null;
  }

  /** Adds a destination column only when Tab would otherwise keep the active cell in place. */
  public extendForRightwardEntry(historyGroup?: SheetCommandResult['historyGroup']): void {
    const index = this.getRightwardEntryExtensionIndex();
    if (index !== null) this.#commands?.run(InsertColumnCommand, { index, historyGroup });
  }

  /** Moves the current Sheet selection according to the requested direction. */
  public navigate(
    direction: (typeof SelectionMoveDirection)[keyof typeof SelectionMoveDirection],
    shiftKey: boolean = false,
    metaKey: boolean = false,
  ): void {
    const searCore = this.requireCore();
    const dataEngine = searCore.getDataEngine();
    const selectionState = dataEngine.getDataType<[RectRange, RectRange]>(this.pluginKey);
    const dataState = readSheetGeometry(dataEngine);
    if (!selectionState || !dataState) return;

    const anchor = selectionState[1].getPoint(0);
    const focus = selectionState[1].getPoint(1);
    if (focus[0] === -1) return;

    const lastRow = dataState.rowSizes.shape[1] - 1;
    const lastCol = dataState.columnSizes.shape[1] - 1;

    let nextAnchor: Point;
    let nextFocus: Point;
    let nextOrigin: Point;
    let nextCursor: Point;

    if (shiftKey) {
      // Extend selection: selectionOrigin is the fixed anchor, selectionCursor tracks the moving end
      const origin: Point = this.#selectionOrigin ?? [...focus];
      const cursor: Point = this.#selectionCursor ?? [...focus];
      const cells = metaKey ? this.readCells() : null;
      const result = extendSelection({
        origin,
        cursor,
        direction,
        lastRow,
        lastCol,
        jumpToEdge: metaKey,
        ...(cells?.forEachStoredInRange
          ? { jumpTarget: this.findDataBoundary(cells, cursor, direction, lastRow, lastCol) }
          : {}),
        findMerge: this.findMergedSelectionRange.bind(this),
      });
      nextOrigin = origin;
      nextCursor = result.cursor;

      // Determine which corner is top-left vs bottom-right
      nextAnchor = result.anchor;
      nextFocus = result.focus;
    } else if (metaKey) {
      // Jump to edge: move focus to the boundary
      let targetRow = focus[0];
      let targetCol = focus[1];
      if (direction === SelectionMoveDirection.Down) {
        targetRow = lastRow;
      } else if (direction === SelectionMoveDirection.Up) {
        targetRow = 0;
      } else if (direction === SelectionMoveDirection.Right) {
        targetCol = lastCol;
      } else {
        targetCol = 0;
      }
      const cells = this.readCells();
      const target = cells?.forEachStoredInRange
        ? this.findDataBoundary(cells, [...focus], direction, lastRow, lastCol)
        : ([targetRow, targetCol] as Point);
      nextAnchor = target;
      nextFocus = target;
      nextOrigin = nextFocus;
      nextCursor = nextFocus;
    } else {
      const result = moveSelection({
        focus,
        direction,
        lastRow,
        lastCol,
        findMerge: this.findMergedSelectionRange.bind(this),
      });
      nextAnchor = result.anchor;
      nextFocus = result.focus;
      nextOrigin = nextFocus;
      nextCursor = nextFocus;
    }

    const rowDirection = direction === SelectionMoveDirection.Up ? -1 : 1;
    const visibleRow = this.findVisibleNavigationRow(dataState.rowSizes, nextCursor[0], rowDirection);
    if (visibleRow === null) return;
    if (visibleRow !== nextCursor[0]) {
      nextCursor = [visibleRow, nextCursor[1]];
      if (shiftKey) {
        nextAnchor = [Math.min(nextOrigin[0], visibleRow), Math.min(nextOrigin[1], nextCursor[1])];
        nextFocus = [Math.max(nextOrigin[0], visibleRow), Math.max(nextOrigin[1], nextCursor[1])];
      } else {
        nextAnchor = nextCursor;
        nextFocus = nextCursor;
        nextOrigin = nextCursor;
      }
    }

    this.executeSelectionCommand(
      searCore,
      nextAnchor,
      nextFocus,
      SheetSelectionSource.Keyboard,
      true,
      nextAnchor,
      nextAnchor,
      void 0,
      { origin: nextOrigin, cursor: nextCursor },
    );
  }

  private findVisibleNavigationRow(rowSizes: DimensionsCSRMatrix, row: number, direction: number): number | null {
    if (rowSizes.getItem(0, row) !== 0) return row;
    const lastRow = rowSizes.shape[1] - 1;
    for (let next = row + direction; next >= 0 && next <= lastRow; next += direction) {
      if (rowSizes.getItem(0, next) !== 0) return next;
    }
    for (let next = row - direction; next >= 0 && next <= lastRow; next -= direction) {
      if (rowSizes.getItem(0, next) !== 0) return next;
    }
    return null;
  }

  private scrollIntoView(
    searCore: SearCoreSheet,
    dataState: SheetGeometryFields,
    targetAnchor: Point,
    targetFocus: Point,
  ): void {
    const { rowSizes, columnSizes } = dataState;
    const scrollManager = searCore.renderEngine.scrollManager;
    const [viewportWidth, viewportHeight] = scrollManager.getShape();
    const { x: scrollX, y: scrollY } = scrollManager.getState();

    const config = searCore.configEngine.getDefaultConfig() as Partial<SheetConfig>;
    const sheetOffsetX = config.sheetOffsetX ?? 50;
    const sheetOffsetY = config.sheetOffsetY ?? 24;
    const viewportContentWidth = viewportWidth - sheetOffsetX;
    const selectionBottomInset = 8;
    const viewportContentHeight = viewportHeight - sheetOffsetY - selectionBottomInset;

    const cellLeft = columnSizes.getDimensionLeftBoundaryByIndex(targetAnchor[1]);
    const cellRight = columnSizes.getDimensionRightBoundaryByIndex(targetFocus[1]);
    const cellTop = rowSizes.getDimensionLeftBoundaryByIndex(targetAnchor[0]);
    const cellBottom = rowSizes.getDimensionRightBoundaryByIndex(targetFocus[0]);
    const freeze = readSheetFreeze(searCore.getDataEngine());
    const frozenWidth = columnSizes.getDimensionLeftBoundaryByIndex(freeze.columns);
    const frozenHeight = rowSizes.getDimensionLeftBoundaryByIndex(freeze.rows);
    const targetInFrozenColumns = targetFocus[1] < freeze.columns;
    const targetInFrozenRows = targetFocus[0] < freeze.rows;
    let fixedHeight = 0;
    readSheetFixedRows(searCore.getDataEngine())?.forEachStored((fixed, _matrixRow, row) => {
      if (fixed === true && row >= freeze.rows && row < targetAnchor[0]) {
        fixedHeight += Math.max(0, rowSizes.getItem(0, row) || 0);
      }
    });

    let newScrollX = scrollX;
    let newScrollY = scrollY;

    if (!targetInFrozenColumns && cellRight > scrollX + viewportContentWidth) {
      newScrollX = cellRight - viewportContentWidth;
    } else if (!targetInFrozenColumns && cellLeft < scrollX + frozenWidth) {
      newScrollX = Math.max(0, cellLeft - frozenWidth);
    }

    if (!targetInFrozenRows && cellBottom > scrollY + viewportContentHeight) {
      newScrollY = cellBottom - viewportContentHeight;
    } else if (!targetInFrozenRows && cellTop < scrollY + frozenHeight + fixedHeight) {
      newScrollY = Math.max(0, cellTop - frozenHeight - fixedHeight);
    }

    if (newScrollX !== scrollX || newScrollY !== scrollY) {
      scrollManager.scrollTo(newScrollX, newScrollY);
    }
  }

  /** Bridges command results into the existing selection interaction pipeline. */
  private executeSelectionCommand(
    searCore: SearCoreSheet,
    anchor: Point,
    focus: Point,
    source: SheetSelectionSource,
    ensureVisible: boolean = false,
    activeAnchor?: Point,
    activeFocus?: Point,
    additionalSelectionMode?: SheetAdditionalSelectionMode,
    navigation?: SheetSelectRangeInput['navigation'],
  ): void {
    const commands = this.getCommandBus(searCore);
    if (!commands) return;
    const input: SheetSelectRangeInput = {
      anchor,
      focus,
      source,
      ensureVisible,
      ...(activeAnchor ? { activeAnchor } : {}),
      ...(activeFocus ? { activeFocus } : {}),
      ...(additionalSelectionMode ? { additionalSelectionMode } : {}),
      ...(navigation ? { navigation } : {}),
    };
    this.#commandCore = searCore;
    try {
      commands.run(SelectRangeCommand, input);
    } finally {
      this.#commandCore = null;
    }
  }

  /** Moves the current Sheet selection to the next selectable row. */
  public navigateDown(): void {
    this.navigate(SelectionMoveDirection.Down);
  }

  /** Repositions an active cell that became hidden after a data reorder. */
  public reconcileActiveCellVisibility(): void {
    const core = this.#core;
    const commands = this.#commands;
    if (!core || !commands) return;
    const dataEngine = core.getDataEngine();
    const visibility = readSheetRowVisibility(dataEngine);
    const active = this.getState()[0].getPoint(0);
    if (!visibility?.active || active[0] < 0 || !visibility.isRowFiltered(active[0])) return;
    const rowCount = readSheetRowSizes(dataEngine)?.shape[1] ?? 0;
    let target = -1;
    for (let row = active[0] + 1; row < rowCount; row += 1) {
      if (!visibility.isRowFiltered(row)) { target = row; break; }
    }
    if (target < 0) {
      for (let row = active[0] - 1; row >= 0; row -= 1) {
        if (!visibility.isRowFiltered(row)) { target = row; break; }
      }
    }
    if (target < 0) return;
    const point: Point = [target, active[1]];
    commands.run(SelectRangeCommand, { anchor: point, focus: point, ensureVisible: true });
  }

  private createSelectRangeCommand(input: SheetSelectRangeInput): PipelineExecutionCommand {
    const searCore = this.#commandCore ?? this.requireCore();
    return new PipelineExecutionCommand(SelectRangeCommand.id, this.createSelectRangePipeline(input, searCore));
  }

  private createSelectRangePipeline(input: SheetSelectRangeInput, searCore: SearCoreSheet): Pipeline {
    const dataState = readSheetGeometry(searCore.getDataEngine());
    const hasActiveRange = input.activeAnchor !== void 0 || input.activeFocus !== void 0;
    const anchor = [...input.anchor] as Point;
    const focus = [...input.focus] as Point;
    const activeAnchor = [...(input.activeAnchor ?? input.anchor)] as Point;
    const activeFocus = [...(input.activeFocus ?? input.focus)] as Point;
    const navigationOrigin = [...(input.navigation?.origin ?? activeFocus)] as Point;
    const navigationCursor = [...(input.navigation?.cursor ?? activeFocus)] as Point;
    const normalized = hasActiveRange
      ? { anchor, focus }
      : selectRange({
          start: input.anchor,
          end: input.focus,
          findMerge: this.findMergedSelectionRange.bind(this),
          lastRow: dataState?.rowSizes.shape[1] ? dataState.rowSizes.shape[1] - 1 : void 0,
          lastCol: dataState?.columnSizes.shape[1] ? dataState.columnSizes.shape[1] - 1 : void 0,
        });
    const operations = [
      createUpdateRectOTOperation([0], activeAnchor, activeFocus),
      createUpdateRectOTOperation([1], normalized.anchor, normalized.focus),
    ];
    const pipeline = this.createSelectionPipeline(
      createSheetTransaction(this.pluginKey, operations),
      normalized.anchor,
      normalized.focus,
      input.source ?? SheetSelectionSource.Api,
    );
    pipeline.addPostCommit('update-selection-navigation', () => {
      this.#selectionOrigin = navigationOrigin[0] < 0 ? null : navigationOrigin;
      this.#selectionCursor = navigationCursor[0] < 0 ? null : navigationCursor;
    });
    const additionalMode =
      input.additionalSelectionMode ??
      (input.source === SheetSelectionSource.Pointer
        ? SheetAdditionalSelectionMode.Preserve
        : SheetAdditionalSelectionMode.Clear);
    if (additionalMode === SheetAdditionalSelectionMode.AppendCurrent) {
      const previous = this.getState()[1];
      if (previous.getPoint(0)[0] >= 0) {
        const previousSnapshot = previous.clone();
        pipeline.addPostCommit('append-additional-selection', () => {
          this.#additionalRanges.push(previousSnapshot);
        });
      }
    } else if (additionalMode === SheetAdditionalSelectionMode.Clear) {
      if (this.#additionalRanges.length) {
        pipeline.addPostCommit('clear-additional-selections', () => {
          this.#additionalRanges = [];
        });
      }
    } else if (additionalMode !== SheetAdditionalSelectionMode.Preserve) {
      throw new SearError(`Unsupported additional selection mode: ${String(additionalMode)}`);
    }
    if (input.ensureVisible) {
      pipeline.addPostCommit(SheetSelectionPipelineStepName.EnsureSelectionVisible, () => {
        const state = readSheetGeometry(searCore.getDataEngine());
        if (state) this.scrollIntoView(searCore, state, [...normalized.anchor], [...normalized.focus]);
      });
    }
    return pipeline;
  }

  private getCommandBus(_searCore: SearCoreSheet): SheetCommandBus | null {
    if (this.#commands) return this.#commands;
    this.platform?.warn('SheetSelectionPlugin getCommandBus skipped: SheetCommandBus is missing.');
    return null;
  }

  /** Registers the commands. */
  public registerCommands(commands: SheetCommandBus): void {
    this.assertRuntimeWriteAllowed();
    if (this.#commands && this.#commands !== commands) {
      throw new SearError('Sheet selection commands are already bound to an editor.');
    }
    this.#commands = commands;
    this.rangeDrag?.registerCommands(commands);
    commands.register(
      RestartSheetSelectionNavigationCommand,
      () => new LocalActionCommand(RestartSheetSelectionNavigationCommand.id, () => this.#restartNavigation()),
    );
    commands.register(HandleSheetSelectionPointerCommand, (input) => {
      const core = this.requireCore();
      if (input.action === SheetSelectionPointerAction.Move) {
        const plan = this.#planPointerMove(core, input);
        if (plan) {
          const pipeline = this.createSelectRangePipeline(plan, core);
          pipeline.addPostCommit('update-selection-pointer', () => this.#updatePointerPosition(input.view));
          return new PipelineExecutionCommand(HandleSheetSelectionPointerCommand.id, pipeline);
        }
        return new LocalActionCommand(HandleSheetSelectionPointerCommand.id, () =>
          this.#updatePointerPosition(input.view),
        );
      }
      return new LocalActionCommand(HandleSheetSelectionPointerCommand.id, () => this.#applyPointerInput(core, input));
    });
    commands.register(ClearSelectedContentsCommand, () => {
      const cells = this.readCells();
      if (!cells)
        return new TransactionPipelineCommand(
          ClearSelectedContentsCommand.id,
          createSheetTransaction(SheetDataPlugin.pluginKey, []),
        );
      const rowVisibility = this.#core ? readSheetRowVisibility(this.#core.getDataEngine()) : null;
      const source = {
        target: SheetDataPlugin.pluginKey,
        getRowCount: () => cells.shape[0],
        getColumnCount: () => cells.shape[1],
        readCell: (row: number, col: number) => cells.getItem(row, col),
        includeCell: (row: number) => !rowVisibility?.active || !rowVisibility.isRowFiltered(row),
        validateClearCell: (row: number, col: number) => this.inputValidation?.validateClear(row, col) ?? { reject: false },
      };
      const seen = new Set<string>();
      const operations = this.#queries!.run(GetSelections, void 0).flatMap((range) =>
        createClearRangeContentsOperations({ anchor: range.start, focus: range.end }, source).filter((operation) => {
          const key = operation.p.join(':');
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }),
      );
      return new TransactionPipelineCommand(
        ClearSelectedContentsCommand.id,
        createSheetTransaction(SheetDataPlugin.pluginKey, operations),
      );
    });
    if (this.rangeMoves)
      commands.register(MoveSheetRangeCommand, (input) => {
        const analysis = this.analyzeRangeMove(input);
        if (analysis.status === SheetRangeMoveStatus.Blocked) throw new SheetRangeMoveRejectedError(analysis);
        const context = analysis.context;
        const pipeline = new Pipeline(MoveSheetRangeCommand.id);
        if (context.source.start.every((coordinate, axis) => coordinate === context.destination.start[axis]))
          return new PipelineExecutionCommand(MoveSheetRangeCommand.id, pipeline);
        if (analysis.status === SheetRangeMoveStatus.RequiresConfirmation && !input.overwrite)
          throw new SheetRangeMoveError(
            SheetRangeMoveErrorCode.DestinationOccupied,
            'The destination contains existing cell data.',
            { context },
          );
        this.rangeMoves!.plan(context).forEach((plan, index) => {
          if (plan.operations.length)
            pipeline.add(`move-owner:${index}`, createSheetTransaction(plan.target, [...plan.operations]));
        });
        const { start, end } = context.destination;
        pipeline.addPostCommit('reset-selection-navigation', () => {
          this.#selectionOrigin = [...start];
          this.#selectionCursor = [...start];
        });
        pipeline.add(
          'move-selection',
          createSheetTransaction(this.key, [
            createUpdateRectOTOperation([0], [...start], [...start]),
            createUpdateRectOTOperation([1], [...start], [...end]),
          ]),
        );
        pipeline.addInteraction('move-selection-changed', {
          type: SheetSelectionInteractionName.Changed,
          anchor: start,
          focus: end,
          source: SheetSelectionSource.Pointer,
        });
        pipeline.addPostRender(SheetHighlightPipelineStepName.Refresh, SheetHighlightPlugin.pluginKey);
        return new PipelineExecutionCommand(MoveSheetRangeCommand.id, pipeline);
      });
    const selectionPlugin = this;
    commands.register(SelectRangeCommand, function createSelectRangeCommand(input) {
      return selectionPlugin.createSelectRangeCommand(input);
    });
    commands.register(EnsureSelectionVisibleCommand, function createEnsureSelectionVisibleCommand(input) {
      return new LocalActionCommand(EnsureSelectionVisibleCommand.id, function ensureSelectionVisible(): void {
        const core = selectionPlugin.requireCore();
        const state = readSheetGeometry(core.getDataEngine());
        if (state) selectionPlugin.scrollIntoView(core, state, [...input.anchor], [...input.focus]);
      });
    });
  }

  private createSelectionPipeline(
    transaction: Transaction,
    anchor: Point,
    focus: Point,
    source: SheetSelectionSource,
  ): Pipeline {
    const pipeline = new Pipeline(SheetSelectionPipelineName.SelectionChange);
    pipeline.add(SheetSelectionPipelineStepName.UpdateSelection, transaction);
    pipeline.addInteraction(SheetSelectionPipelineStepName.RecordSelectionChange, {
      type: SheetSelectionInteractionName.Changed,
      anchor,
      focus,
      source,
    });
    pipeline.addPostRender(SheetHighlightPipelineStepName.Refresh, SheetHighlightPlugin.pluginKey);
    return pipeline;
  }

  private validateRangeMove(input: MoveSheetRangeInput): SheetRangeMoveContext {
    const context = resolveSheetRangeMove(input);
    const geometry = readSheetGeometry(this.requireCore().getDataEngine());
    const valid =
      geometry &&
      [context.source, context.destination].every(
        (range) =>
          [range.start, range.end].every((point) =>
            point.every((value) => Number.isSafeInteger(value) && value >= 0),
          ) &&
          range.end[0] < geometry.rowSizes.shape[1] &&
          range.end[1] < geometry.columnSizes.shape[1],
      );
    if (!valid)
      throw new SheetRangeMoveError(SheetRangeMoveErrorCode.InvalidRange, 'Range move is outside sheet bounds.', {
        input,
      });
    return context;
  }

  private analyzeRangeMove(input: MoveSheetRangeInput): SheetRangeMoveAnalysis {
    let context: SheetRangeMoveContext;
    try {
      context = this.validateRangeMove(input);
    } catch (error) {
      if (!(error instanceof SheetRangeMoveError)) throw error;
      return {
        status: SheetRangeMoveStatus.Blocked,
        context: resolveSheetRangeMove(input),
        issue: {
          ownerId: 'sheet.selection.rangeMove',
          code: error.code,
          message: error.message,
          details: error.details,
        },
      };
    }
    return this.rangeMoves!.analyze(context);
  }

  /** Cancels transient pointer work before this editor is released. */
  public onEditorDestroy(): void {
    this.assertRuntimeWriteAllowed();
    this.#handlePointerUp();
    this.rangeDrag?.destroy(this.#rangeDragOwnerToken);
    this.#disposeAdditionalHighlight?.();
    this.#disposeAdditionalHighlight = null;
  }

  /** Restarts selection navigation from the current active cell. */
  public restartNavigation(): void {
    if (this.hasStateWriteBoundary()) {
      if (!this.#commands) throw new SearError('Sheet selection navigation command is unavailable.');
      this.#commands.run(RestartSheetSelectionNavigationCommand, void 0);
      return;
    }
    this.#restartNavigation();
  }

  #restartNavigation(): void {
    this.subscribeNavigationHandlers();
    this.keyboardRouter.startListener();
  }

  /** Applies a transaction to SheetSelectionPlugin state. */
  public apply(pluginState: [RectRange, RectRange], transaction: Transaction) {
    let changed = false;
    const geometry = this.#core ? readSheetGeometry(this.#core.getDataEngine()) : null;
    let lastRow = geometry ? geometry.rowSizes.shape[1] - 1 : Infinity;
    let lastColumn = geometry ? geometry.columnSizes.shape[1] - 1 : Infinity;

    for (const operation of transaction.operations) {
      if (RectOTActionName.UpdateRect in operation && operation.ur !== void 0) {
        pluginState[operation.p[0]] = RectOT.apply(pluginState[operation.p[0]], [operation]);
        changed = true;
      } else if (isMatrixStructureOperation(operation)) {
        if (MatrixOTActionName.RowInsert in operation) lastRow += 1;
        if (MatrixOTActionName.RowDelete in operation) lastRow -= 1;
        if (MatrixOTActionName.ColInsert in operation) lastColumn += 1;
        if (MatrixOTActionName.ColDelete in operation) lastColumn -= 1;
        pluginState[0] = RectOT.apply(pluginState[0], [operation]);
        pluginState[1] = RectOT.apply(pluginState[1], [operation]);
        normalizeDeletedSelection(pluginState[0], lastRow, lastColumn);
        normalizeDeletedSelection(pluginState[1], lastRow, lastColumn);
        changed = true;
      }
    }

    const hasResize = transaction.operations.some(
      (operation) => isResizeRowOperation(operation) || isResizeColOperation(operation),
    );

    if (!changed && !hasResize) return null;
    return pluginState;
  }

  /** Rebases local keyboard anchors only after structural transactions commit. */
  public onTransactionCommitted(transaction: Transaction): void {
    if (this.#commands && !this.#commands.isExecuting()) {
      throw new SearError('Sheet selection changes must run through editor.commands.run(...).');
    }
    for (const operation of transaction.operations) {
      if (!isMatrixStructureOperation(operation)) continue;
      this.#selectionOrigin = this.rebaseSelectionPoint(this.#selectionOrigin, operation);
      this.#selectionCursor = this.rebaseSelectionPoint(this.#selectionCursor, operation);
    }
    const selection = this.getState();
    const range = selection[1];
    if (range.getPoint(0)[0] < 0) return;
    const active = selection[0].getPoint(0);
    if (this.#selectionOrigin && !selectionContainsPoint(range, this.#selectionOrigin))
      this.#selectionOrigin = [...active];
    if (this.#selectionCursor && !selectionContainsPoint(range, this.#selectionCursor))
      this.#selectionCursor = [...active];
  }

  /** @inheritdoc */
  public override registerConfig() {
    return [{ key: this.key, config: new ConfigUnit(sheetSelectionPluginConfig) }];
  }

  /** @inheritdoc */
  public override registerState() {
    return { key: this.key, state: this.getState() };
  }

  /** Locks committed selection rectangles while transaction clones remain writable. */
  public override lockCommittedState(state: [RectRange, RectRange]): void {
    state.forEach((range) => range.lockMutations());
    Object.freeze(state);
  }

  private rebaseSelectionPoint(point: Point | null, operation: MatrixStructureOTOperation<unknown>): Point | null {
    if (!point) return null;
    const rect = new RectRange([[...point], [...point]]);
    RectOT.apply(rect, [operation]);
    return [...rect.getPoint(0)];
  }

  /** Renders SheetSelectionPlugin scene output. */
  public render(
    searCore: SearCoreSheet,
    offset: { x: number; y: number } = (() => {
      const config = searCore.configEngine.getDefaultConfig() as Partial<SheetConfig>;
      return { x: config.sheetOffsetX ?? 50, y: config.sheetOffsetY ?? 24 };
    })(),
  ): Node<CellProperties>[] {
    this.#bindCoreReference(searCore);
    const dataEngine = searCore.getDataEngine();

    const selectionState = dataEngine.getDataType<[RectRange, RectRange]>(this.pluginKey);
    if (!selectionState) return [];
    if (selectionState[1].shape.join('') === RectRange.Empty.join('')) return [];

    const pluginConfig = searCore.configEngine.getPluginConfig(this.key) as typeof sheetSelectionPluginConfig;

    const state = readSheetGeometry(dataEngine);
    if (!state) throw new SearError('sheet geometry fields are not found in SheetSelectionPlugin render.');
    const { rowSizes, columnSizes } = state;

    const anchor = selectionState[1].getPoint(0);
    const focus = selectionState[1].getPoint(1);
    const freeze = readSheetFreeze(dataEngine);
    const scrollState = searCore.renderEngine.scrollManager.getState();
    const fixedY =
      anchor[0] === focus[0]
        ? activeFixedRowOffsets(readSheetFixedRows(dataEngine), rowSizes, scrollState.y, freeze.rows, offset.y).get(
            anchor[0],
          )
        : undefined;
    const frozenTop = (freeze.rows > 0 && Math.max(anchor[0], focus[0]) < freeze.rows) || fixedY !== void 0;
    const frozenLeft = freeze.columns > 0 && Math.max(anchor[1], focus[1]) < freeze.columns;
    const positionRect = getSheetRangePositionRect(anchor, focus, {
      rowSizes,
      columnSizes,
      offsetX: offset.x,
      offsetY: offset.y,
    });
    if (!positionRect) return [];
    if (fixedY !== void 0) positionRect.y = fixedY;

    const { renderCoordinatorManager } = searCore.renderEngine;

    const lastRow = rowSizes.shape[1] - 1;
    const lastCol = columnSizes.shape[1] - 1;
    const isFullRowSelection = anchor[1] === 0 && focus[1] === lastCol;
    const isFullColumnSelection = anchor[0] === 0 && focus[0] === lastRow;
    const shouldBeClipInDirtyRender = isFullRowSelection || isFullColumnSelection;
    const [viewportWidth, viewportHeight] = searCore.renderEngine.scrollManager.getShape();

    const cell = renderCoordinatorManager.create({ type: EmptyCell.symbol }, positionRect, {
      type: EmptyCell.symbol,
      strokeWidth: 2,
      depth: this.depth + 4,
      stroke: pluginConfig.defaultBorderColor,
      // Selection is stroke-only; clicks inside should pass through to underlying cells.
      skipHit: true,
      shouldBeClipInDirtyRender,
      semanticOwner: SheetSelectionRenderSemantics.owner,
      semanticRole: SheetSelectionRenderSemantics.outlineRole,
      // Selection is an overlay for the grid content, not for sticky UI.
      // Keep it below row/column headers even though OverlayRenderStrategy
      // renders edit nodes after the sticky pass.
      overlayClipRect:
        frozenTop || frozenLeft
          ? undefined
          : {
              x: scrollState.x + offset.x,
              y: scrollState.y + offset.y,
              width: Math.max(0, viewportWidth - offset.x),
              height: Math.max(0, viewportHeight - offset.y),
            },
    });
    const rect = cell?.render();
    if (rect) {
      const nodes = [rect].flat();
      nodes.forEach((n) => {
        (n.properties as Record<string, unknown>)['isEdit'] = true;
        if (frozenTop || frozenLeft)
          n.setStickyTree(true, {
            ...(frozenTop ? { top: positionRect.y } : {}),
            ...(frozenLeft ? { left: positionRect.x } : {}),
          });
      });
      if (!isFullRowSelection && !isFullColumnSelection) {
        const handleRect = {
          x: positionRect.x + positionRect.width - 4,
          y: positionRect.y + positionRect.height - 4,
          width: 8,
          height: 8,
        };
        const handle = renderCoordinatorManager.create({ type: EmptyCell.symbol }, handleRect, {
          type: EmptyCell.symbol,
          fill: pluginConfig.defaultBorderColor,
          stroke: '#ffffff',
          strokeWidth: 1,
          depth: this.depth + 5,
          skipHit: true,
          overlayClipRect:
            frozenTop || frozenLeft
              ? undefined
              : {
                  x: scrollState.x + offset.x,
                  y: scrollState.y + offset.y,
                  width: Math.max(0, viewportWidth - offset.x),
                  height: Math.max(0, viewportHeight - offset.y),
                },
        });
        const marker = handle?.render();
        if (marker) nodes.push(...[marker].flat());
      }
      return nodes;
    }
    return [];
  }
}

function normalizeDeletedSelection(selection: RectRange, lastRow: number, lastColumn: number): void {
  const start = selection.getPoint(0);
  const end = selection.getPoint(1);
  if (start[0] > end[0]) {
    const row = Math.max(0, Math.min(end[0], lastRow));
    start[0] = row;
    end[0] = row;
  }
  if (start[1] > end[1]) {
    const column = Math.max(0, Math.min(end[1], lastColumn));
    start[1] = column;
    end[1] = column;
  }
}

function selectionContainsPoint(selection: RectRange, point: Point): boolean {
  const start = selection.getPoint(0);
  const end = selection.getPoint(1);
  return point[0] >= start[0] && point[0] <= end[0] && point[1] >= start[1] && point[1] <= end[1];
}
