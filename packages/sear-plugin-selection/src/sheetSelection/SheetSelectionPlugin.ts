import { SearError } from '@searsuite/sear-foundation-error';

import { Pipeline } from '@searsuite/sear-assembly-plugin';
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

import { Injectable } from '@searsuite/sear-foundation-di';

import { SheetCellMergePlugin } from '@searsuite/sear-plugin-cell-merge';
import { SheetCellInputValidationRegistry } from '@searsuite/sear-domain-cell-types';

import { Rect as RectRange, Point, createEmptyRect } from '@searsuite/sear-foundation-rect';
import { Platform } from '@searsuite/sear-foundation-platform';
import { Transaction } from '@searsuite/sear-domain-transaction';

import { SheetDataPlugin } from '@searsuite/sear-plugin-sheet-data';
import {
  ReadSheetCellDataQuery,
  readSheetColumnSizes,
  readSheetRowVisibility,
  readSheetRowSizes,
  type SheetCellDataReader,
} from '@searsuite/sear-domain-sheet';
import { type DataEngine } from '@searsuite/sear-domain-state';
import { type DimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';

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

import {
  createSheetTransaction,
  createClearRangeContentsOperations,
  InsertColumnCommand,
  InsertRowCommand,
  type SheetRangeBounds,
  extendSelection,
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
  SheetAdditionalSelectionMode,
  type SheetSelectRangeInput,
} from '../SheetSelectionCommands';

import { type SheetSelectionOptions } from '../SheetSelectionOptions';
import { registerSheetFillRangeCommand } from '../SheetFillRangeCommand';
import { readSheetCellMerges } from '@searsuite/sear-plugin-cell-merge';

const key = new PluginKey('SheetSelection');

export type SheetSelectionSessionState = readonly [RectRange, RectRange];

export const SheetSelectionSessionStateDefinition = defineSessionState<SheetSelectionSessionState>('sheet.selection');

export const SheetAdditionalSelectionsSessionStateDefinition =
  defineSessionState<readonly RectRange[]>('sheet.selection.additional');

interface SheetGeometryFields {
  rowSizes: DimensionsCSRMatrix;
  columnSizes: DimensionsCSRMatrix;
}

function readSheetGeometry(dataEngine: DataEngine): SheetGeometryFields | null {
  const rowSizes = readSheetRowSizes(dataEngine);
  const columnSizes = readSheetColumnSizes(dataEngine);
  return rowSizes && columnSizes ? { rowSizes, columnSizes } : null;
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

@Injectable()
export class SheetSelectionPlugin extends Plugin<[RectRange, RectRange]> {
  readonly #data: DataEngine;
  readonly #options: SheetSelectionOptions;
  public constructor(options: SheetSelectionOptions) {
    super({ key, state: [createEmptyRect(), createEmptyRect()] });
    this.#data = options.data;
    this.#options = options;
    this.#queries = options.queries;
    this.#sheetCellMergePlugin = options.merges;
    this.#rangeMoves = options.rangeMoves;
    this.#inputValidation = options.validation;
    this.#formats = options.formats;
    this.#platform = options.platform;
    if (options.interactionReducers) registerSheetSelectionInteractionReducers(options.interactionReducers);
  }

  public getNavigation(): { readonly origin: Point | null; readonly cursor: Point | null } {
    return {
      origin: this.#selectionOrigin ? [...this.#selectionOrigin] : null,
      cursor: this.#selectionCursor ? [...this.#selectionCursor] : null,
    };
  }

  public getAdditionalSelections(): readonly SheetRangeBounds[] {
    return this.#additionalRanges.map((range) => ({
      start: [...range.getPoint(0)] as Point,
      end: [...range.getPoint(1)] as Point,
    }));
  }

  #executeSelectionCommand(
    anchor: Point,
    focus: Point,
    source: SheetSelectionSource,
    ensureVisible = false,
    activeAnchor?: Point,
    activeFocus?: Point,
    additionalSelectionMode?: SheetAdditionalSelectionMode,
    navigation?: SheetSelectRangeInput['navigation'],
  ): void {
    if (!this.#commands) throw new SearError('Sheet selection commands are unavailable.');
    this.#commands.run(SelectRangeCommand, {
      anchor,
      focus,
      source,
      ensureVisible,
      ...(activeAnchor ? { activeAnchor } : {}),
      ...(activeFocus ? { activeFocus } : {}),
      ...(additionalSelectionMode ? { additionalSelectionMode } : {}),
      ...(navigation ? { navigation } : {}),
    });
  }
  readonly #platform: Platform | undefined;

  readonly #rangeMoves: SheetRangeMoveRegistry | undefined;

  readonly #inputValidation: SheetCellInputValidationRegistry | undefined;

  readonly #formats: SheetFormatTransferRegistry | undefined;

  public static readonly symbol: symbol = Symbol.for('SheetSelectionPlugin');

  public static readonly pluginKey = key;

  #additionalRanges: RectRange[] = [];

  #selectionOrigin: Point | null = null;

  #selectionCursor: Point | null = null;

  #queries: SheetQueryRegistry | null = null;

  #commands: SheetCommandBus | undefined;

  readonly #sheetCellMergePlugin: Pick<SheetCellMergePlugin, 'isMergedCell'>;

  public registerQueries(queries: SheetQueryRegistry): void {
    this.assertRuntimeWriteAllowed();
    if (this.#queries && this.#queries !== queries) {
      throw new SearError('Sheet selection queries are already bound to an editor.');
    }
    this.#queries = queries;
    if (this.#rangeMoves) {
      queries.register(AnalyzeSheetRangeMove, (input) => this.#analyzeRangeMove(input));
      queries.register(GetSheetRangeMoveConflict, (input) => {
        const analysis = this.#analyzeRangeMove(input);
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

  public isInMergedCell(rangeRect: RectRange) {
    loop: for (let rowIndex = rangeRect.getPoint(0)[0]; rowIndex <= rangeRect.getPoint(1)[0]; rowIndex++) {
      for (let colIndex = rangeRect.getPoint(0)[1]; colIndex <= rangeRect.getPoint(1)[1]; colIndex++) {
        const mergedCell = this.#sheetCellMergePlugin.isMergedCell(rowIndex, colIndex);
        if (mergedCell && !RectRange.contains(rangeRect, mergedCell)) return mergedCell;
      }
    }
    return null;
  }

  #findMergedSelectionRange(point: readonly [number, number]): { start: Point; end: Point } | undefined {
    const merge = this.#sheetCellMergePlugin.isMergedCell(point[0], point[1]);
    return merge ? { start: merge.getPoint(0), end: merge.getPoint(1) } : void 0;
  }

  #readCells(): SheetCellDataReader | null {
    return this.#queries?.has(ReadSheetCellDataQuery) ? this.#queries.run(ReadSheetCellDataQuery, void 0) : null;
  }

  #findDataBoundary(
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

  public getDownwardEntryExtensionIndex(): number | null {
    const geometry = readSheetGeometry(this.#data);
    const row = this.getState()[0].getPoint(0)[0];
    const lastRow = (geometry?.rowSizes.shape[1] ?? 0) - 1;
    return row >= 0 && row === lastRow && this.#commands?.has(InsertRowCommand) ? lastRow + 1 : null;
  }

  public extendForDownwardEntry(historyGroup?: SheetCommandResult['historyGroup']): void {
    const index = this.getDownwardEntryExtensionIndex();
    if (index !== null) this.#commands?.run(InsertRowCommand, { index, historyGroup });
  }

  public getRightwardEntryExtensionIndex(): number | null {
    const geometry = readSheetGeometry(this.#data);
    const col = this.getState()[0].getPoint(0)[1];
    const lastCol = (geometry?.columnSizes.shape[1] ?? 0) - 1;
    return col >= 0 && col === lastCol && this.#commands?.has(InsertColumnCommand) ? lastCol + 1 : null;
  }

  public extendForRightwardEntry(historyGroup?: SheetCommandResult['historyGroup']): void {
    const index = this.getRightwardEntryExtensionIndex();
    if (index !== null) this.#commands?.run(InsertColumnCommand, { index, historyGroup });
  }

  public navigate(
    direction: (typeof SelectionMoveDirection)[keyof typeof SelectionMoveDirection],
    shiftKey: boolean = false,
    metaKey: boolean = false,
  ): void {
    const dataEngine = this.#data;
    const selectionState = this.getState();
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
      const cells = metaKey ? this.#readCells() : null;
      const result = extendSelection({
        origin,
        cursor,
        direction,
        lastRow,
        lastCol,
        jumpToEdge: metaKey,
        ...(cells?.forEachStoredInRange
          ? { jumpTarget: this.#findDataBoundary(cells, cursor, direction, lastRow, lastCol) }
          : {}),
        findMerge: this.#findMergedSelectionRange.bind(this),
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
      const cells = this.#readCells();
      const target = cells?.forEachStoredInRange
        ? this.#findDataBoundary(cells, [...focus], direction, lastRow, lastCol)
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
        findMerge: this.#findMergedSelectionRange.bind(this),
      });
      nextAnchor = result.anchor;
      nextFocus = result.focus;
      nextOrigin = nextFocus;
      nextCursor = nextFocus;
    }

    const rowDirection = direction === SelectionMoveDirection.Up ? -1 : 1;
    const visibleRow = this.#findVisibleNavigationRow(dataState.rowSizes, nextCursor[0], rowDirection);
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

    this.#executeSelectionCommand(
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

  #findVisibleNavigationRow(rowSizes: DimensionsCSRMatrix, row: number, direction: number): number | null {
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

  public navigateDown(): void {
    this.navigate(SelectionMoveDirection.Down);
  }

  public reconcileActiveCellVisibility(): void {
    const commands = this.#commands;
    if (!commands) return;
    const dataEngine = this.#data;
    const visibility = readSheetRowVisibility(dataEngine);
    const active = this.getState()[0].getPoint(0);
    if (!visibility?.active || active[0] < 0 || !visibility.isRowFiltered(active[0])) return;
    const rowCount = readSheetRowSizes(dataEngine)?.shape[1] ?? 0;
    let target = -1;
    for (let row = active[0] + 1; row < rowCount; row += 1) {
      if (!visibility.isRowFiltered(row)) {
        target = row;
        break;
      }
    }
    if (target < 0) {
      for (let row = active[0] - 1; row >= 0; row -= 1) {
        if (!visibility.isRowFiltered(row)) {
          target = row;
          break;
        }
      }
    }
    if (target < 0) return;
    const point: Point = [target, active[1]];
    commands.run(SelectRangeCommand, { anchor: point, focus: point, ensureVisible: true });
  }

  #createSelectionPipeline(
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
    return pipeline;
  }

  #validateRangeMove(input: MoveSheetRangeInput): SheetRangeMoveContext {
    const context = resolveSheetRangeMove(input);
    const geometry = readSheetGeometry(this.#data);
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

  #analyzeRangeMove(input: MoveSheetRangeInput): SheetRangeMoveAnalysis {
    let context: SheetRangeMoveContext;
    try {
      context = this.#validateRangeMove(input);
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
    return this.#rangeMoves!.analyze(context);
  }

  public apply(pluginState: [RectRange, RectRange], transaction: Transaction) {
    let changed = false;
    const geometry = readSheetGeometry(this.#data);
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

  public onTransactionCommitted(transaction: Transaction): void {
    if (this.#commands && !this.#commands.isExecuting()) {
      throw new SearError('Sheet selection changes must run through editor.commands.run(...).');
    }
    for (const operation of transaction.operations) {
      if (!isMatrixStructureOperation(operation)) continue;
      this.#selectionOrigin = this.#rebaseSelectionPoint(this.#selectionOrigin, operation);
      this.#selectionCursor = this.#rebaseSelectionPoint(this.#selectionCursor, operation);
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

  public override registerState() {
    return { key: this.key, state: this.getState() };
  }

  public override lockCommittedState(state: [RectRange, RectRange]): void {
    state.forEach((range) => range.lockMutations());
    Object.freeze(state);
  }

  #rebaseSelectionPoint(point: Point | null, operation: MatrixStructureOTOperation<unknown>): Point | null {
    if (!point) return null;
    const rect = new RectRange([[...point], [...point]]);
    RectOT.apply(rect, [operation]);
    return [...rect.getPoint(0)];
  }
  public planSelection(input: SheetSelectRangeInput): SheetCommandResult {
    const dataState = readSheetGeometry(this.#data);
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
          findMerge: this.#findMergedSelectionRange.bind(this),
          lastRow: dataState?.rowSizes.shape[1] ? dataState.rowSizes.shape[1] - 1 : void 0,
          lastCol: dataState?.columnSizes.shape[1] ? dataState.columnSizes.shape[1] - 1 : void 0,
        });
    const operations = [
      createUpdateRectOTOperation([0], activeAnchor, activeFocus),
      createUpdateRectOTOperation([1], normalized.anchor, normalized.focus),
    ];
    const pipeline = this.#createSelectionPipeline(
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
    return {
      pipeline,
      ...(input.ensureVisible
        ? {
            effects: [
              {
                kind: 'ensure-selection-visible' as const,
                anchor: [...normalized.anchor] as Point,
                focus: [...normalized.focus] as Point,
              },
            ],
          }
        : {}),
    };
  }
  public registerCommands(commands: SheetCommandBus): void {
    this.assertRuntimeWriteAllowed();
    if (this.#commands && this.#commands !== commands) throw new SearError('Selection commands are already bound.');
    this.#commands = commands;
    if (this.#options.codecs && this.#inputValidation)
      registerSheetFillRangeCommand(
        commands,
        this.#options.queries,
        this.#inputValidation,
        this.#options.codecs,
        () => readSheetCellMerges(this.#data),
        () => readSheetRowVisibility(this.#data),
        this.#formats,
        this.#options.ownerData,
      );
    commands.register(ClearSelectedContentsCommand, () => {
      const cells = this.#readCells();
      if (!cells)
        return new TransactionPipelineCommand(
          ClearSelectedContentsCommand.id,
          createSheetTransaction(SheetDataPlugin.pluginKey, []),
        );
      const rowVisibility = readSheetRowVisibility(this.#data);
      const source = {
        target: SheetDataPlugin.pluginKey,
        getRowCount: () => cells.shape[0],
        getColumnCount: () => cells.shape[1],
        readCell: (row: number, col: number) => cells.getItem(row, col),
        includeCell: (row: number) => !rowVisibility?.active || !rowVisibility.isRowFiltered(row),
        validateClearCell: (row: number, col: number) =>
          this.#inputValidation?.validateClear(row, col) ?? { reject: false },
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
    if (this.#rangeMoves) {
      commands.register(MoveSheetRangeCommand, (input) => {
        const analysis = this.#analyzeRangeMove(input);
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
        this.#rangeMoves!.plan(context).forEach((plan, index) => {
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
        return new PipelineExecutionCommand(MoveSheetRangeCommand.id, pipeline);
      });
    }
    commands.register(SelectRangeCommand, (input) => ({
      id: SelectRangeCommand.id,
      execute: () => this.planSelection(input),
    }));
    commands.register(EnsureSelectionVisibleCommand, (input) => ({
      id: EnsureSelectionVisibleCommand.id,
      execute: () => ({
        pipeline: new Pipeline(EnsureSelectionVisibleCommand.id),
        effects: [
          {
            kind: 'ensure-selection-visible' as const,
            anchor: [...input.anchor] as Point,
            focus: [...input.focus] as Point,
          },
        ],
      }),
    }));
  }
}
