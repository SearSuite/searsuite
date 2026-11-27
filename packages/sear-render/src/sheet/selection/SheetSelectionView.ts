import { ViewExtensionBase } from '@searsuite/sear-render-event-engine';
import { SheetSelectionPlugin } from '@searsuite/sear-plugin-selection';
import { SheetCommandEffectRegistry } from '@searsuite/sear-assembly-commands';
import { SearError } from '@searsuite/sear-foundation-error';
import { SearCoreSheet } from '@searsuite/sear-assembly-core';

import { PluginKey, SheetFormatTransferRegistry } from '@searsuite/sear-assembly-plugin';
import { EventWithOffsetAndTarget } from '@searsuite/sear-render-event-engine';
import { ConfigUnit } from '@searsuite/sear-assembly-config';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { KeyboardRouter, PointerCapture, TextInput } from '@searsuite/sear-render-input';
import { getSheetRangePositionRect } from '../getSheetRangePositionRect';
import { SheetCellMergePlugin } from '@searsuite/sear-plugin-cell-merge';
import { CellType } from '@searsuite/sear-domain-cell-types';
import { readSheetFreeze } from '@searsuite/sear-plugin-freeze';
import { readSheetFixedRows } from '@searsuite/sear-plugin-fixed-row';
import { activeFixedRowOffsets } from '../SheetFreezeLayout';
import { Rect as RectRange, Point } from '@searsuite/sear-foundation-rect';
import { Platform } from '@searsuite/sear-foundation-platform';

import { Node } from '@searsuite/sear-render-node';

import {
  ReadSheetCellDataQuery,
  readSheetColumnSizes,
  readSheetRowSizes,
  type SheetCellDataReader,
} from '@searsuite/sear-domain-sheet';
import { type DataEngine } from '@searsuite/sear-domain-state';
import { type DimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import { type SheetConfig } from '@searsuite/sear-assembly-config';
import { CellProperties, CellRegion, EmptyCell } from '@searsuite/sear-render-registry';

import { SheetHighlightRegistry } from '../highlight/SheetHighlightRegistry';

import { SheetSelectionRenderSemantics } from './SheetSelectionRenderSemantics';
import { SheetSelectionSource } from '@searsuite/sear-plugin-selection';

import { SheetRangeDrag } from './SheetRangeDrag';
import { FillSheetRangeCommand } from '@searsuite/sear-plugin-selection';
import {
  HandleSheetSelectionPointerCommand,
  SheetSelectionPointerAction,
  type SheetSelectionPointerInput,
} from './SheetSelectionPointerCommand';
import {
  ClearRangeContentsCommand,
  LocalActionCommand,
  selectRange,
  SelectionMoveDirection,
  SheetCommandBus,
  SheetQueryRegistry,
} from '@searsuite/sear-assembly-commands';
import {
  ClearSelectedContentsCommand,
  SelectRangeCommand,
  SheetAdditionalSelectionMode,
  type SheetSelectRangeInput,
} from '@searsuite/sear-plugin-selection';
import { RestartSheetSelectionNavigationCommand } from './SelectionViewCommands';
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
 * Presents Sheet selections and translates native input into owner commands.
 *
 * The independent selection plugin owns ranges and navigation state. This view
 * owns pointer capture, keyboard routing, viewport effects and visual highlights.
 */
@Injectable()
export class SheetSelectionView extends ViewExtensionBase<SearCoreSheet, CellProperties> {
  public static readonly symbol = Symbol.for('SheetSelectionView');
  readonly #owner: SheetSelectionPlugin;
  #disposeKeyboard: (() => void) | null = null;
  readonly #effectDisposers: Array<() => void> = [];
  get #selectionOrigin(): Point | null {
    return this.#owner.getNavigation().origin;
  }
  get #selectionCursor(): Point | null {
    return this.#owner.getNavigation().cursor;
  }
  get #additionalRanges(): RectRange[] {
    return this.#owner.getAdditionalSelections().map((range) => new RectRange([[...range.start], [...range.end]]));
  }
  public constructor(
    @Inject(SheetSelectionPlugin.symbol) owner: SheetSelectionPlugin,
    @Inject(SheetCellMergePlugin.symbol) merges: SheetCellMergePlugin,
    @Inject(KeyboardRouter.symbol) keyboard: KeyboardRouter,
    @Inject(Platform.symbol) platform: Platform,
    @Inject(SheetRangeDrag.symbol) rangeDrag: SheetRangeDrag,
    @Inject(SheetHighlightRegistry.symbol) highlights: SheetHighlightRegistry,
    @Inject(PointerCapture.symbol) pointer: PointerCapture,
    @Inject(TextInput.symbol) text: TextInput,
    @Inject(SheetFormatTransferRegistry.symbol) formats: SheetFormatTransferRegistry,
    @Inject(SheetCommandBus.symbol) commands: SheetCommandBus,
    @Inject(SheetQueryRegistry.symbol) queries: SheetQueryRegistry,
  ) {
    super(new PluginKey('SheetSelectionView'));
    this.#owner = owner;
    this.#sheetCellMergePlugin = merges;
    this.#keyboardRouter = keyboard;
    this.#platform = platform;
    this.#rangeDrag = rangeDrag;
    this.#highlights = highlights;
    this.#pointerCapture = pointer;
    this.#textInput = text;
    this.#formats = formats;
    this.#commands = commands;
    this.#queries = queries;
  }

  public registerEffects(registry: SheetCommandEffectRegistry): void {
    this.#effectDisposers.push(
      registry.register('ensure-selection-visible', ({ anchor, focus }) => {
        const core = this.#requireCore();
        const geometry = readSheetGeometry(core.dataEngine);
        if (geometry) this.#scrollIntoView(core, geometry, [...anchor], [...focus]);
      }),
    );
    this.#effectDisposers.push(registry.register('focus-editor', () => this.#textInput?.refocus()));
  }

  public registerCommands(commands: SheetCommandBus): void {
    if (this.#commands !== commands) throw new SearError('Selection view commands are already bound.');
    this.#rangeDrag?.registerCommands(commands);
    commands.register(
      RestartSheetSelectionNavigationCommand,
      () => new LocalActionCommand(RestartSheetSelectionNavigationCommand.id, () => this.#restartNavigation()),
    );
    commands.register(HandleSheetSelectionPointerCommand, (input) => {
      const core = this.#requireCore();
      if (input.action === SheetSelectionPointerAction.Move) {
        const plan = this.#planPointerMove(core, input);
        if (plan) {
          const result = this.#owner.planSelection(plan);
          result.pipeline.addPostCommit('update-selection-pointer', () => this.#updatePointerPosition(input.view));
          return { id: HandleSheetSelectionPointerCommand.id, execute: () => result };
        }
        return new LocalActionCommand(HandleSheetSelectionPointerCommand.id, () =>
          this.#updatePointerPosition(input.view),
        );
      }
      return new LocalActionCommand(HandleSheetSelectionPointerCommand.id, () => this.#applyPointerInput(core, input));
    });
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
    this.#commands!.run(SelectRangeCommand, {
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

  readonly #keyboardRouter: KeyboardRouter;
  readonly #platform: Platform | undefined;
  readonly #rangeDrag: SheetRangeDrag | undefined;
  readonly #highlights: SheetHighlightRegistry | undefined;
  readonly #pointerCapture: PointerCapture | undefined;
  readonly #textInput: TextInput | undefined;
  readonly #formats: SheetFormatTransferRegistry | undefined;

  #isSelecting: boolean = false;
  #selectionPointer: { x: number; y: number } | null = null;
  #selectionScrollFrame: number | null = null;
  #disposeSelectionCapture: (() => void) | null = null;
  #disposeAdditionalHighlight: (() => void) | null = null;
  #headerDragMode: 'none' | 'row' | 'col' = 'none';
  #core: SearCoreSheet | null = null;
  #queries: SheetQueryRegistry | null = null;
  #commands: SheetCommandBus | undefined;
  readonly #rangeDragOwnerToken = {};
  /** Optional merge capability used to normalize selection movement. */
  readonly #sheetCellMergePlugin: SheetCellMergePlugin;

  /** Binds this presentation to the core owned by its editor-local container. */
  public initializeView(core: SearCoreSheet): void {
    this.#bindCoreReference(core);
    this.#restartNavigation();
    this.#rangeDrag?.bind(core, () => this.#owner.getState()[1], this.#rangeDragOwnerToken);
    if (this.#highlights && !this.#disposeAdditionalHighlight) {
      this.#disposeAdditionalHighlight = this.#highlights.register({
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
    if (this.#core) {
      throw new SearError('Sheet selection core cannot be replaced after editor assembly.');
    }
    this.#core = core;
  }

  #requireCore(): SearCoreSheet {
    if (!this.#core) throw new SearError('SheetSelectionPlugin is not bound to a Sheet editor core.');
    return this.#core;
  }

  /** @inheritdoc */
  public depth: number = -1;

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
    return this.#rangeDrag?.onFillHandleDoubleClick(event) ?? false;
  }

  /** Handles the mouse down lifecycle event. */
  public onMouseDown(searCore: SearCoreSheet, event: EventWithOffsetAndTarget<CellProperties>): boolean | void {
    if (event.target?.properties.region === CellRegion.Corner && (event.origin?.button ?? 0) !== 0) return;
    if (event.origin?.button === 2 && event.target) {
      const { region, startRowIndex, startColIndex } = event.target.properties;
      const range = this.#owner.getState()[1];
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
    if (!additive && this.#rangeDrag?.onMouseDown(event)) return false;
    return this.#dispatchPointerInput(searCore, selectionPointerInput(SheetSelectionPointerAction.Down, event));
  }

  #dispatchPointerInput(searCore: SearCoreSheet, input: SheetSelectionPointerInput): boolean | void {
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
        this.#advanceSelectionScroll();
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
      this.#executeSelectionCommand(
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
        this.#platform?.warn(
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
        this.#platform?.warn(
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
      findMerge: this.#findMergedSelectionRange.bind(this),
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
      this.#executeSelectionCommand(
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
      this.#executeSelectionCommand(
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
    this.#disposeSelectionCapture =
      this.#pointerCapture?.start({
        onRelease: () => {
          if (!this.#isSelecting) return;
          this.#dispatchPointerInput(searCore, selectionPointerInput(SheetSelectionPointerAction.Up));
          this.#textInput?.startListener();
          this.#textInput?.refocus();
        },
      }) ?? null;
  }

  /** Handles the mouse move lifecycle event. */
  public onMouseMove(searCore: SearCoreSheet, event: EventWithOffsetAndTarget<CellProperties>): boolean | void {
    if (this.#rangeDrag?.isActive()) return false;
    if (!this.#isSelecting) return;
    return this.#dispatchPointerInput(searCore, selectionPointerInput(SheetSelectionPointerAction.Move, event));
  }

  #handlePointerMove(searCore: SearCoreSheet, input: SheetSelectionPointerInput): void {
    this.#updatePointerPosition(input.view);
    const plan = this.#planPointerMove(searCore, input);
    if (!plan) return;
    this.#executeSelectionCommand(
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
    this.#scheduleSelectionScroll();
  }

  #planPointerMove(searCore: SearCoreSheet, input: SheetSelectionPointerInput): SheetSelectRangeInput | null {
    const target = input.target;
    if (!target) {
      this.#platform?.warn('SheetSelectionPlugin onMouseMove event target is null');
      return null;
    }

    const properties = target;
    const { startRowIndex, startColIndex } = properties;
    const { endRowIndex, endColIndex } = properties;

    if (startRowIndex === void 0 || startColIndex === void 0 || endRowIndex === void 0 || endColIndex === void 0) {
      this.#platform?.warn('SheetSelectionPlugin onMouseMove target properties is missing ExcelNodeProperties');
      return null;
    }
    const dataEngine = searCore.getDataEngine();
    const state = dataEngine.getDataType<[RectRange, RectRange]>(SheetSelectionPlugin.pluginKey);
    if (!state) {
      this.#platform?.warn('SheetSelectionPlugin onMouseMove selection state is not found');
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

      let mergedCell = this.#owner.isInMergedCell(new RectRange(boundingRect.shape));

      let times = 0;
      while (mergedCell) {
        times++;
        const boundingRect = RectRange.findBoundingRectangle([new RectRange([anchorNode, focusNode]), mergedCell]);
        anchorNode = boundingRect.getPoint(0);
        focusNode = boundingRect.getPoint(1);

        mergedCell = this.#owner.isInMergedCell(new RectRange(boundingRect.shape));
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
    if (this.#selectionScrollFrame !== null) this.#platform?.cancelAnimationFrame(this.#selectionScrollFrame);
    this.#selectionScrollFrame = null;
    this.#headerDragMode = 'none';
  }

  #scheduleSelectionScroll(): void {
    if (!this.#platform || this.#selectionScrollFrame !== null || !this.#selectionPointer) return;
    this.#selectionScrollFrame = this.#platform.requestAnimationFrame(() => {
      this.#commands!.run(HandleSheetSelectionPointerCommand, { action: SheetSelectionPointerAction.Tick });
    });
  }

  #advanceSelectionScroll(): void {
    if (!this.#isSelecting || !this.#selectionPointer) return;
    const core = this.#requireCore();
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
      const anchor = this.#selectionOrigin ?? this.#owner.getState()[0].getPoint(0);
      const end: Point =
        this.#headerDragMode === 'row'
          ? [row, geometry.columnSizes.shape[1] - 1]
          : this.#headerDragMode === 'col'
          ? [geometry.rowSizes.shape[1] - 1, col]
          : [row, col];
      const start: Point =
        this.#headerDragMode === 'row' ? [anchor[0], 0] : this.#headerDragMode === 'col' ? [0, anchor[1]] : [...anchor];
      this.#executeSelectionCommand(start, end, SheetSelectionSource.Pointer, false, start, end, void 0, {
        origin: this.#selectionOrigin ?? start,
        cursor: end,
      });
    }
    this.#scheduleSelectionScroll();
  }

  #findMergedSelectionRange(point: readonly [number, number]): { start: Point; end: Point } | undefined {
    const merge = this.#sheetCellMergePlugin.isMergedCell(point[0], point[1]);
    return merge ? { start: merge.getPoint(0), end: merge.getPoint(1) } : void 0;
  }

  // ─── Arrow / Enter key navigation ────────────────────────────────────────

  #subscribeNavigationHandlers(): void {
    this.#disposeKeyboard?.();
    this.#disposeKeyboard =
      this.#keyboardRouter.subscribe({
        onDelete: this.#handleSelectionDeleteKey.bind(this),
        onSelectAll: this.#handleSelectionSelectAllKey.bind(this),
        onHome: this.#handleSelectionHomeKey.bind(this),
        onEnd: this.#handleSelectionEndKey.bind(this),
        onPage: this.#handleSelectionPageKey.bind(this),
        onHorizontalPage: this.#handleSelectionHorizontalPageKey.bind(this),
        onSelectRow: this.#handleSelectionSelectRowKey.bind(this),
        onSelectColumn: this.#handleSelectionSelectColumnKey.bind(this),
        onEnter: this.#handleSelectionEnterKey.bind(this),
        onArrowDown: this.#handleSelectionArrowDown.bind(this),
        onArrowUp: this.#handleSelectionArrowUp.bind(this),
        onArrowLeft: this.#handleSelectionArrowLeft.bind(this),
        onArrowRight: this.#handleSelectionArrowRight.bind(this),
        onTab: this.#handleSelectionTabKey.bind(this),
        onFillDown: () => this.#fillSelectionFromEdge('down'),
        onFillRight: () => this.#fillSelectionFromEdge('right'),
        onCopyFormulaAbove: () => this.#copyFormulaFromAbove(),
      }) || null;
  }

  #fillSelectionFromEdge(direction: 'down' | 'right'): void {
    if (this.#additionalRanges.length) return;
    const range = this.#owner.getState()[1];
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
      source:
        direction === 'down' ? { start: [top, left], end: [top, right] } : { start: [top, left], end: [bottom, left] },
      target: [bottom, right],
    });
  }

  #copyFormulaFromAbove(): void {
    if (this.#additionalRanges.length) return;
    const range = this.#owner.getState()[1];
    const cell = range.getPoint(0);
    if (cell[0] <= 0 || cell[1] < 0 || cell.some((value, index) => value !== range.getPoint(1)[index])) return;
    if (this.#readCells()?.getItem(cell[0] - 1, cell[1])?.type !== CellType.Formula) return;
    const above: [number, number] = [cell[0] - 1, cell[1]];
    this.#commands?.run(FillSheetRangeCommand, {
      source: { start: above, end: above },
      target: cell,
      mode: 'exact',
    });
  }

  #handleSelectionDeleteKey(): void {
    if (this.#additionalRanges.length) {
      this.#commands?.run(ClearSelectedContentsCommand, void 0);
      return;
    }
    const range = this.#owner.getState()[1];
    const anchor = range.getPoint(0);
    const focus = range.getPoint(1);
    if (anchor[0] < 0 || focus[0] < 0) return;
    this.#commands?.run(ClearRangeContentsCommand, { anchor, focus });
  }

  #handleSelectionSelectAllKey(): void {
    const core = this.#requireCore();
    const geometry = readSheetGeometry(core.getDataEngine());
    if (!geometry || geometry.rowSizes.shape[1] === 0 || geometry.columnSizes.shape[1] === 0) return;
    const current = this.#owner.getState();
    const active = current[0].getPoint(0);
    const cells = this.#readCells();
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
        this.#executeSelectionCommand([top, left], [bottom, right], SheetSelectionSource.Keyboard);
        return;
      }
    }
    this.#executeSelectionCommand(
      [0, 0],
      [geometry.rowSizes.shape[1] - 1, geometry.columnSizes.shape[1] - 1],
      SheetSelectionSource.Keyboard,
    );
  }

  #handleSelectionHomeKey(primaryModifier: boolean, shiftKey: boolean): void {
    const cell = shiftKey
      ? this.#selectionCursor ?? this.#owner.getState()[0].getPoint(0)
      : this.#owner.getState()[0].getPoint(0);
    if (cell[0] < 0) return;
    const target: Point = [primaryModifier ? 0 : cell[0], 0];
    this.#selectNavigationTarget(target, shiftKey);
  }

  #readCells(): SheetCellDataReader | null {
    return this.#queries?.has(ReadSheetCellDataQuery) ? this.#queries.run(ReadSheetCellDataQuery, void 0) : null;
  }

  #handleSelectionEndKey(shiftKey: boolean): void {
    const cells = this.#readCells();
    if (!cells?.forEachStoredInRange || cells.shape[0] === 0 || cells.shape[1] === 0) return;
    let row = 0;
    let col = 0;
    cells.forEachStoredInRange(0, 0, cells.shape[0] - 1, cells.shape[1] - 1, (cell, cellRow, cellCol) => {
      if (cell.value == null && !cell.formula) return;
      row = Math.max(row, cellRow);
      col = Math.max(col, cellCol);
    });
    const formatted = this.#formats?.usedExtent(cells.shape[0] - 1, cells.shape[1] - 1);
    if (formatted) {
      row = Math.max(row, formatted[0]);
      col = Math.max(col, formatted[1]);
    }
    const target: Point = [row, col];
    this.#selectNavigationTarget(target, shiftKey);
  }

  #handleSelectionPageKey(direction: -1 | 1, shiftKey: boolean): void {
    const core = this.#requireCore();
    const geometry = readSheetGeometry(core.getDataEngine());
    const cell = shiftKey
      ? this.#selectionCursor ?? this.#owner.getState()[0].getPoint(0)
      : this.#owner.getState()[0].getPoint(0);
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
    this.#selectNavigationTarget(target, shiftKey);
    scrollManager.requestScrollTo(scroll.x, Math.max(0, scroll.y + direction * pageSize));
  }

  #handleSelectionHorizontalPageKey(direction: -1 | 1, shiftKey: boolean): void {
    const core = this.#requireCore();
    const geometry = readSheetGeometry(core.getDataEngine());
    const cell = shiftKey
      ? this.#selectionCursor ?? this.#owner.getState()[0].getPoint(0)
      : this.#owner.getState()[0].getPoint(0);
    if (!geometry || cell[1] < 0) return;
    const scrollManager = core.renderEngine.scrollManager;
    const scroll = scrollManager.getState();
    const sheetOffset = (core.configEngine.getDefaultConfig() as Partial<SheetConfig>).sheetOffsetX ?? 50;
    const pageSize = Math.max(1, scrollManager.getShape()[0] - sheetOffset);
    const columns = geometry.columnSizes;
    const currentLeft = columns.getDimensionLeftBoundaryByIndex(cell[1]);
    const targetOffset = Math.max(0, currentLeft + direction * pageSize);
    const col = Math.max(0, Math.min(columns.shape[1] - 1, columns.getLeftBoundaryColIndexByDimension(targetOffset)));
    this.#selectNavigationTarget([cell[0], col], shiftKey);
    scrollManager.requestScrollTo(Math.max(0, scroll.x + direction * pageSize), scroll.y);
  }

  #selectNavigationTarget(target: Point, extend: boolean): void {
    const core = this.#requireCore();
    if (!extend) {
      this.#executeSelectionCommand(target, target, SheetSelectionSource.Keyboard, true);
      return;
    }
    const origin = this.#selectionOrigin ?? this.#owner.getState()[0].getPoint(0);
    const anchor: Point = [Math.min(origin[0], target[0]), Math.min(origin[1], target[1])];
    const focus: Point = [Math.max(origin[0], target[0]), Math.max(origin[1], target[1])];
    this.#executeSelectionCommand(anchor, focus, SheetSelectionSource.Keyboard, true, anchor, anchor, void 0, {
      origin,
      cursor: target,
    });
  }

  #handleSelectionSelectRowKey(): void {
    const core = this.#requireCore();
    const range = this.#owner.getState()[1];
    const start = range.getPoint(0);
    const end = range.getPoint(1);
    const geometry = readSheetGeometry(core.getDataEngine());
    if (start[0] < 0 || !geometry) return;
    this.#executeSelectionCommand(
      [start[0], 0],
      [end[0], geometry.columnSizes.shape[1] - 1],
      SheetSelectionSource.Keyboard,
    );
  }

  #handleSelectionSelectColumnKey(): void {
    const core = this.#requireCore();
    const cell = this.#owner.getState()[0].getPoint(0);
    const geometry = readSheetGeometry(core.getDataEngine());
    if (cell[1] < 0 || !geometry) return;
    this.#executeSelectionCommand(
      [0, cell[1]],
      [geometry.rowSizes.shape[1] - 1, cell[1]],
      SheetSelectionSource.Keyboard,
    );
  }

  #handleSelectionEnterKey(shiftKey: boolean): void {
    const state = this.#owner.getState();
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
      this.#executeSelectionCommand([...start], [...end], SheetSelectionSource.Keyboard, false, target, target);
      return;
    }
    if (!shiftKey) this.#owner.extendForDownwardEntry();
    this.#owner.navigate(shiftKey ? SelectionMoveDirection.Up : SelectionMoveDirection.Down);
  }

  #handleSelectionArrowDown(shiftKey: boolean, metaKey: boolean): void {
    this.#owner.navigate(SelectionMoveDirection.Down, shiftKey, metaKey);
  }

  #handleSelectionArrowUp(shiftKey: boolean, metaKey: boolean): void {
    this.#owner.navigate(SelectionMoveDirection.Up, shiftKey, metaKey);
  }

  #handleSelectionArrowLeft(shiftKey: boolean, metaKey: boolean): void {
    this.#owner.navigate(SelectionMoveDirection.Left, shiftKey, metaKey);
  }

  #handleSelectionArrowRight(shiftKey: boolean, metaKey: boolean): void {
    this.#owner.navigate(SelectionMoveDirection.Right, shiftKey, metaKey);
  }

  #handleSelectionTabKey(shiftKey: boolean): void {
    const state = this.#owner.getState();
    const start = state[1].getPoint(0);
    const end = state[1].getPoint(1);
    if (start[0] < 0) return;
    const merge = this.#findMergedSelectionRange(start);
    const singleMergedCell =
      merge &&
      merge.start[0] === start[0] &&
      merge.start[1] === start[1] &&
      merge.end[0] === end[0] &&
      merge.end[1] === end[1];
    if ((start[0] === end[0] && start[1] === end[1]) || singleMergedCell) {
      if (!shiftKey) this.#owner.extendForRightwardEntry();
      this.#owner.navigate(shiftKey ? SelectionMoveDirection.Left : SelectionMoveDirection.Right);
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
    this.#executeSelectionCommand([...start], [...end], SheetSelectionSource.Keyboard, false, target, target);
  }

  #scrollIntoView(
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

  /** Cancels transient pointer work before this editor is released. */
  public destroyView(): void {
    this.assertRuntimeWriteAllowed();
    this.#disposeKeyboard?.();
    this.#disposeKeyboard = null;
    this.#effectDisposers
      .splice(0)
      .reverse()
      .forEach((dispose) => dispose());
    this.#handlePointerUp();
    this.#rangeDrag?.destroy(this.#rangeDragOwnerToken);
    this.#disposeAdditionalHighlight?.();
    this.#disposeAdditionalHighlight = null;
  }

  #restartNavigation(): void {
    this.#subscribeNavigationHandlers();
    this.#keyboardRouter.startListener();
  }

  /** @inheritdoc */
  public override registerConfig() {
    return [{ key: this.key, config: new ConfigUnit(sheetSelectionPluginConfig) }];
  }

  /** Renders the committed selection as view-owned scene nodes. */
  public render(
    searCore: SearCoreSheet,
    offset: { x: number; y: number } = (() => {
      const config = searCore.configEngine.getDefaultConfig() as Partial<SheetConfig>;
      return { x: config.sheetOffsetX ?? 50, y: config.sheetOffsetY ?? 24 };
    })(),
  ): Node<CellProperties>[] {
    const dataEngine = searCore.getDataEngine();

    const selectionState = dataEngine.getDataType<[RectRange, RectRange]>(SheetSelectionPlugin.pluginKey);
    if (!selectionState) return [];
    if (selectionState[1].shape.join('') === RectRange.Empty.join('')) return [];

    const pluginConfig = searCore.configEngine.getConfig(this.key) as typeof sheetSelectionPluginConfig;

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
