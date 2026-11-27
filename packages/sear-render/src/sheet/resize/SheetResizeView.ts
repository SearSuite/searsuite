import { ViewExtensionBase } from '@searsuite/sear-render-event-engine';
import { SheetResizePlugin } from '@searsuite/sear-plugin-resize';
import {
  type ResizePointer,
  type DragTarget,
  ResizeAxis,
  HEADER_WIDTH,
  HEADER_HEIGHT,
  MIN_ROW_HEIGHT,
  MIN_COL_WIDTH,
  readResizeSheetFields,
  getSelectedIndices,
  detectResizeHandle,
  detectHiddenMarkerClick,
  getResizePointer,
} from './SheetResizeGeometry';
import { SearError } from '@searsuite/sear-foundation-error';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { SearCoreSheet } from '@searsuite/sear-assembly-core';
import { SheetMatrix } from '@searsuite/sear-domain-sheet';

import { DataEngine } from '@searsuite/sear-domain-state';
import { CellProperties } from '@searsuite/sear-render-registry';
import { EventWithOffsetAndTarget } from '@searsuite/sear-render-event-engine';
import { SheetCommandBus, type SheetCommandDefinition } from '@searsuite/sear-assembly-commands';
import { type SheetConfig } from '@searsuite/sear-assembly-config';
import { createDragGuideNode, type Node } from '@searsuite/sear-render-node';
import { PositionRect, Rect as RectRange } from '@searsuite/sear-foundation-rect';
import { registerSheetResizeDragCommands } from './SheetResizeCommandRegistration';
import {
  ResizeSheetColumnsCommand,
  ResizeSheetRowsCommand,
  HideSheetColumnsCommand,
  HideSheetRowsCommand,
  UnhideSheetColumnsCommand,
  UnhideSheetRowsCommand,
  type SheetDimensionResizeInput,
} from '@searsuite/sear-plugin-resize';
import { isResizeColOperation, isResizeRowOperation } from '@searsuite/sear-domain-ot';

import { CoordinateEngine } from '@searsuite/sear-render-coord';
import {
  CursorEngine,
  CursorRegistry,
  CursorToken,
  type CursorPosition,
  type PositionCursorRule,
} from '@searsuite/sear-render-cursor';
import { SheetSelectionPlugin } from '@searsuite/sear-plugin-selection';

import { createFontDescriptor, TextShaper } from '@searsuite/sear-render-metrics';
import { CellType } from '@searsuite/sear-domain-cell-types';
import { SheetEmbeddedEditor, type SheetDocumentNode } from '@searsuite/sear-sheet-editor-contract';
import {
  BeginSheetResizeDragCommand,
  EndSheetResizeDragCommand,
  UpdateSheetResizeDragCommand,
  type SheetBeginResizeDragInput,
  type SheetUpdateResizeDragInput,
} from './SheetResizeCommands';
import { Platform } from '@searsuite/sear-foundation-platform';
import { Transaction } from '@searsuite/sear-domain-transaction';
import { KeyboardRouter, PointerCapture, type PointerCapturePoint } from '@searsuite/sear-render-input';
import { TriangleNode } from './TriangleNode';

interface CellDisplayTextReader {
  getDisplayText(
    cell: {
      type: string | symbol;
      value?: unknown;
      formula?: string;
      format?: unknown;
    },
    context: unknown,
  ): string;
}

/** Derived cells that have display text without a stored Sheet data entry. */
export interface SheetResizeProjectedCells {
  forEachProjectedCellInRange(
    startRow: number,
    startColumn: number,
    endRow: number,
    endColumn: number,
    visit: (cell: { type: string | symbol; value?: unknown; formula?: string }, row: number, col: number) => void,
  ): void;
}

function readSheetDataAxisCount(sheetData: SheetMatrix, axis: 0 | 1): number {
  const shape = (sheetData as { readonly shape?: readonly number[] }).shape;
  const count = shape?.[axis];
  return typeof count === 'number' && Number.isInteger(count) && count >= 0 ? count : Number.MAX_SAFE_INTEGER;
}

const cellDisplayTextRegistrySymbol = Symbol.for('CellDisplayTextRegistry');

const ResizeCursorRuleKey = {
  HiddenMarker: Symbol('SheetResizePlugin.hidden-marker'),
  RowHandle: Symbol('SheetResizePlugin.row-handle'),
  ColumnHandle: Symbol('SheetResizePlugin.column-handle'),
} as const;

interface ResizeDragState {
  isDragging: boolean;
  dragTarget: DragTarget | null;
  dragStartWorld: { x: number; y: number } | null;
  currentWorld: { x: number; y: number } | null;
}

/** Owns row and column resize state, interaction, and visual feedback. */
@Injectable()
export class SheetResizeView extends ViewExtensionBase<SearCoreSheet, CellProperties> {
  public static readonly symbol = Symbol.for('SheetResizeView');
  readonly #stateOwner: SheetResizePlugin;
  readonly #coordEngine: CoordinateEngine;
  readonly #cursorEngine: CursorEngine;
  readonly #textShaper: TextShaper;
  readonly #displayTextRegistry: CellDisplayTextReader;
  readonly #pointerCapture: PointerCapture;
  readonly #commands: SheetCommandBus | undefined;
  readonly #platform: Platform | undefined;
  readonly #commandDataEngine: DataEngine | undefined;
  readonly #embeddedEditor: SheetEmbeddedEditor | undefined;
  readonly #keyboardRouter: KeyboardRouter | undefined;
  /** @inheritdoc */
  public depth: number = 100;

  readonly #MARKER_STROKE = 'rgba(56, 110, 246, 0.9)';
  readonly #unregisterCursorPositionRules: (() => void)[];
  #shouldConsumeNextDoubleClick = false;
  #commandCore: SearCoreSheet | null = null;
  #projectedCells: SheetResizeProjectedCells | null = null;
  #registeredCommandBus: SheetCommandBus | null = null;
  #disposePointerCapture: (() => void) | null = null;
  #dragState: ResizeDragState = {
    isDragging: false,
    dragTarget: null,
    dragStartWorld: null,
    currentWorld: null,
  };

  /** Creates a SheetResizePlugin instance. */
  constructor(
    @Inject(SheetResizePlugin.symbol) stateOwner: SheetResizePlugin,
    @Inject(CoordinateEngine.symbol)
    coordEngine: CoordinateEngine,
    @Inject(CursorEngine.symbol)
    cursorEngine: CursorEngine,
    @Inject(TextShaper.symbol)
    textShaper: TextShaper,
    @Inject(cellDisplayTextRegistrySymbol)
    displayTextRegistry: CellDisplayTextReader,
    @Inject(PointerCapture.symbol)
    pointerCapture: PointerCapture,
    @Inject(SheetCommandBus.symbol)
    commands?: SheetCommandBus,
    @Inject(Platform.symbol)
    platform?: Platform,
    @Inject(CursorRegistry.symbol)
    cursorRegistry?: CursorRegistry,
    @Inject(DataEngine.symbol)
    commandDataEngine?: DataEngine,
    @Inject(SheetEmbeddedEditor.symbol)
    embeddedEditor?: SheetEmbeddedEditor,
    @Inject(KeyboardRouter.symbol)
    keyboardRouter?: KeyboardRouter,
  ) {
    super(new PluginKey('SheetResizeView'));
    this.#stateOwner = stateOwner;
    this.#coordEngine = coordEngine;
    this.#cursorEngine = cursorEngine;
    this.#textShaper = textShaper;
    this.#displayTextRegistry = displayTextRegistry;
    this.#pointerCapture = pointerCapture;
    this.#commands = commands;
    this.#platform = platform;
    this.#commandDataEngine = commandDataEngine;
    this.#embeddedEditor = embeddedEditor;
    this.#keyboardRouter = keyboardRouter;
    this.#unregisterCursorPositionRules = this.#registerCursorPositionRules(cursorRegistry);
  }

  /** Registers the commands. */
  public registerCommands(commands: SheetCommandBus): void {
    if (this.#registeredCommandBus && this.#registeredCommandBus !== commands) {
      throw new SearError('Sheet resize commands are already bound to an editor.');
    }
    this.#registeredCommandBus = commands;
    registerSheetResizeDragCommands(commands, this);
    this.#keyboardRouter?.subscribe({
      onHideRows: () => this.#hideSelectedAxis('row'),
      onHideColumns: () => this.#hideSelectedAxis('column'),
    });
  }

  #hideSelectedAxis(axis: 'row' | 'column'): void {
    const range = this.#commandDataEngine?.getDataType<[RectRange, RectRange]>(SheetSelectionPlugin.pluginKey)?.[1];
    if (!range || !this.#registeredCommandBus) return;
    const start = range.getPoint(0)[axis === 'row' ? 0 : 1];
    const end = range.getPoint(1)[axis === 'row' ? 0 : 1];
    if (start < 0) return;
    if (axis === 'row') this.#registeredCommandBus.run(HideSheetRowsCommand, { index: start, count: end - start + 1 });
    else this.#registeredCommandBus.run(HideSheetColumnsCommand, { index: start, count: end - start + 1 });
  }

  /** Applies a command-owned resize drag start to local interaction state. */
  public beginResizeDrag(input: SheetBeginResizeDragInput): void {
    this.#assertDragCommand();
    this.#dragState = {
      isDragging: true,
      dragTarget: {
        type: input.axis === 'row' ? ResizeAxis.Row : ResizeAxis.Column,
        primaryIndex: input.primaryIndex,
        initialSizes: new Map(input.initialSizes.map((entry) => [entry.index, entry.size])),
      },
      dragStartWorld: { x: input.world.x, y: input.world.y },
      currentWorld: { x: input.world.x, y: input.world.y },
    };
  }

  /** Applies a command-owned resize drag move to local interaction state. */
  public updateResizeDrag(input: SheetUpdateResizeDragInput): void {
    this.#assertDragCommand();
    this.#dragState = { ...this.#dragState, currentWorld: { x: input.world.x, y: input.world.y } };
    this.#commandCore?.requestRender(this);
  }

  /** Clears command-owned resize drag state. */
  public endResizeDrag(): void {
    this.#assertDragCommand();
    this.#dragState = {
      isDragging: false,
      dragTarget: null,
      dragStartWorld: null,
      currentWorld: null,
    };
    this.#commandCore?.requestRender(this);
  }

  /** Returns a detached view of the local drag session. */
  public getResizeState(): ResizeDragState {
    const drag = this.#dragState;
    return {
      isDragging: drag.isDragging,
      dragTarget: drag.dragTarget
        ? {
            ...drag.dragTarget,
            initialSizes: new Map(drag.dragTarget.initialSizes),
          }
        : null,
      dragStartWorld: drag.dragStartWorld ? { ...drag.dragStartWorld } : null,
      currentWorld: drag.currentWorld ? { ...drag.currentWorld } : null,
    };
  }

  #assertDragCommand(): void {
    if (this.#registeredCommandBus && !this.#registeredCommandBus.isExecuting()) {
      throw new SearError('Sheet resize drag changes must run through a command.');
    }
  }

  /** Includes sparse derived display cells in auto-fit measurements. */
  public setProjectedCells(source: SheetResizeProjectedCells): void {
    this.#projectedCells = source;
  }

  /** @inheritdoc */
  public onMouseMove(searCore: SearCoreSheet, _event: EventWithOffsetAndTarget<CellProperties>): boolean | void {
    const pointer = getResizePointer(this.#coordEngine, _event);
    const { world } = pointer;
    const state = this.#dragState;

    if (state.isDragging && state.dragTarget && state.dragStartWorld) {
      this.#runCommand(searCore, UpdateSheetResizeDragCommand, { world: { x: world.x, y: world.y } });
      return false;
    }

    // Cursor presentation is resolved by SheetCursorView from the position
    // rules registered in this constructor. Keeping this plugin out of the
    // normal apply path makes cursor precedence independent of plugin order.
  }

  /** @inheritdoc */
  public onMouseDown(searCore: SearCoreSheet, _event: EventWithOffsetAndTarget<CellProperties>): boolean | void {
    const pointer = getResizePointer(this.#coordEngine, _event);
    const { world } = pointer;

    const unhideIndex = detectHiddenMarkerClick(searCore, pointer, this.#stateOwner.getState().dimensions);
    if (unhideIndex !== null) {
      this.#dispatchUnhide(searCore, unhideIndex.type, unhideIndex.index);
      return false;
    }

    const handle = detectResizeHandle(searCore, pointer, this.#stateOwner.getState().dimensions);

    if (handle) {
      if ((_event.clickCount ?? 0) >= 2) {
        this.#dispatchAutoFit(searCore, handle);
        this.#shouldConsumeNextDoubleClick = true;
        return false;
      }

      const cursor: CursorToken = handle.type === ResizeAxis.Row ? CursorToken.RowResize : CursorToken.ColumnResize;
      this.#cursorEngine.override(cursor);

      const selectedIndices = getSelectedIndices(
        searCore,
        handle.type,
        handle.primaryIndex,
        this.#stateOwner.getState().dimensions,
      );
      const initialSizes = new Map<number, number>();
      const sheetFields = readResizeSheetFields(searCore, this.#stateOwner.getState().dimensions);
      if (selectedIndices) {
        const sizes = handle.type === ResizeAxis.Row ? sheetFields?.rowSizes : sheetFields?.columnSizes;
        const fallback = handle.type === ResizeAxis.Row ? MIN_ROW_HEIGHT : MIN_COL_WIDTH;
        for (const idx of selectedIndices) {
          initialSizes.set(idx, sizes?.getItem(0, idx) || fallback);
        }
      } else {
        const sizes = handle.type === ResizeAxis.Row ? sheetFields?.rowSizes : sheetFields?.columnSizes;
        const fallback = handle.type === ResizeAxis.Row ? MIN_ROW_HEIGHT : MIN_COL_WIDTH;
        initialSizes.set(handle.primaryIndex, sizes?.getItem(0, handle.primaryIndex) || fallback);
      }

      this.#runCommand(searCore, BeginSheetResizeDragCommand, {
        axis: handle.type,
        primaryIndex: handle.primaryIndex,
        initialSizes: Array.from(initialSizes, ([index, size]) => ({ index, size })),
        world: { x: world.x, y: world.y },
      });
      this.#startResizePointerCapture(searCore);
      return false;
    }
  }

  /** @inheritdoc */
  public onMouseUp(searCore: SearCoreSheet, event: EventWithOffsetAndTarget<CellProperties>): void {
    this.#finishResizeDrag(searCore, getResizePointer(this.#coordEngine, event).world);
  }

  /** @inheritdoc */
  public onDblClick(searCore: SearCoreSheet, _event: EventWithOffsetAndTarget<CellProperties>): boolean | void {
    if (this.#shouldConsumeNextDoubleClick) {
      this.#shouldConsumeNextDoubleClick = false;
      return false;
    }

    const pointer = getResizePointer(this.#coordEngine, _event);
    const handle = detectResizeHandle(searCore, pointer, this.#stateOwner.getState().dimensions);
    if (!handle) return;

    this.#dispatchAutoFit(searCore, handle);
    return false;
  }

  #dispatchResize(
    searCore: SearCoreSheet,
    dragTarget: DragTarget,
    dragStartWorld: { x: number; y: number },
    currentWorld: { x: number; y: number },
  ): void {
    const { type, primaryIndex, initialSizes } = dragTarget;
    const delta = type === ResizeAxis.Row ? currentWorld.y - dragStartWorld.y : currentWorld.x - dragStartWorld.x;
    const minSize = type === ResizeAxis.Row ? MIN_ROW_HEIGHT : MIN_COL_WIDTH;
    const primarySize = initialSizes.get(primaryIndex);
    if (primarySize === undefined) return;
    const newSize = Math.max(minSize, primarySize + delta);

    const sizes: SheetDimensionResizeInput[] = [];
    for (const [idx, initial] of initialSizes) {
      sizes.push({ index: idx, size: newSize, previousSize: initial });
    }

    if (sizes.length === 0) return;
    this.#runCommand(searCore, type === ResizeAxis.Row ? ResizeSheetRowsCommand : ResizeSheetColumnsCommand, { sizes });
  }

  #dispatchUnhide(searCore: SearCoreSheet, type: ResizeAxis, index: number): void {
    const sheetFields = readResizeSheetFields(searCore, this.#stateOwner.getState().dimensions);
    const originalSize =
      type === ResizeAxis.Row
        ? sheetFields?.rowHiddenOriginalSizes.getItem(0, index)
        : sheetFields?.columnHiddenOriginalSizes.getItem(0, index);
    if (originalSize === void 0 || originalSize === null || originalSize === 0) return;
    this.#runCommand(searCore, type === ResizeAxis.Row ? UnhideSheetRowsCommand : UnhideSheetColumnsCommand, { index });
  }

  #startResizePointerCapture(searCore: SearCoreSheet): void {
    this.#disposePointerCapture?.();
    this.#disposePointerCapture = this.#pointerCapture.start({
      onMove: (capturedEvent) => this.#updateCapturedResizeDrag(searCore, capturedEvent),
      onRelease: (capturedEvent) => this.#finishResizeDrag(searCore, this.#getCapturedWorld(capturedEvent)),
    });
  }

  #updateCapturedResizeDrag(searCore: SearCoreSheet, event: PointerCapturePoint): void {
    const world = this.#getCapturedWorld(event);
    if (!world) return;
    const state = this.#dragState;
    if (!state.isDragging || !state.dragTarget || !state.dragStartWorld) return;
    if (state.currentWorld && state.currentWorld.x === world.x && state.currentWorld.y === world.y) return;
    this.#runCommand(searCore, UpdateSheetResizeDragCommand, { world });
  }

  #getCapturedWorld(event: PointerCapturePoint): { x: number; y: number } {
    return this.#coordEngine.screenToWorld(event.view.x, event.view.y);
  }

  #finishResizeDrag(searCore: SearCoreSheet, currentWorld: { x: number; y: number } | null): void {
    const state = this.#dragState;
    this.#disposePointerCapture?.();
    this.#disposePointerCapture = null;

    if (state.isDragging && state.dragTarget && state.dragStartWorld && currentWorld) {
      this.#dispatchResize(searCore, state.dragTarget, state.dragStartWorld, currentWorld);
      this.#cursorEngine.override(null);
    }

    this.#runCommand(searCore, EndSheetResizeDragCommand, void 0);
  }

  /** Converts a registry pointer context into the mixed-coordinate resize pointer representation. */
  #toResizePointer(position: {
    world: { x: number; y: number };
    view: { x: number; y: number };
    target: CellProperties | null;
  }): ResizePointer {
    return {
      world: position.world,
      view: position.view,
      region: position.target?.region,
    };
  }

  /** Registers all resize-owned position rules through the central cursor registry. */
  #registerCursorPositionRules(cursorRegistry?: CursorRegistry): (() => void)[] {
    if (!cursorRegistry) return [];
    return [
      cursorRegistry.registerPosition({
        key: ResizeCursorRuleKey.HiddenMarker,
        layer: 102,
        cursor: CursorToken.Pointer,
        test: this.#isHiddenMarkerCursorTarget.bind(this),
      }),
      this.#registerResizeHandleCursorRule(
        cursorRegistry,
        ResizeCursorRuleKey.RowHandle,
        ResizeAxis.Row,
        CursorToken.RowResize,
      ),
      this.#registerResizeHandleCursorRule(
        cursorRegistry,
        ResizeCursorRuleKey.ColumnHandle,
        ResizeAxis.Column,
        CursorToken.ColumnResize,
      ),
    ];
  }

  /** Registers one axis-specific resize-handle rule using shared coordinate matching. */
  #registerResizeHandleCursorRule(
    cursorRegistry: CursorRegistry,
    key: PositionCursorRule['key'],
    axis: ResizeAxis,
    cursor: CursorToken,
  ): () => void {
    const resizePlugin = this;
    return cursorRegistry.registerPosition({
      key,
      layer: 101,
      cursor,
      test: function isResizeHandleCursorTarget(position): boolean {
        return resizePlugin.#getResizeHandleAtPosition(position)?.type === axis;
      },
    });
  }

  #isHiddenMarkerCursorTarget(position: CursorPosition): boolean {
    return (
      detectHiddenMarkerClick(
        position.core,
        this.#toResizePointer(position),
        this.#stateOwner.getState().dimensions,
      ) !== null
    );
  }

  /** Resolves a resize handle from the cursor registry's shared pointer context. */
  #getResizeHandleAtPosition(position: CursorPosition): DragTarget | null {
    return detectResizeHandle(position.core, this.#toResizePointer(position), this.#stateOwner.getState().dimensions);
  }

  #dispatchAutoFit(searCore: SearCoreSheet, handle: DragTarget): void {
    if (!this.#textShaper) return;
    const sheetFields = readResizeSheetFields(searCore, this.#stateOwner.getState().dimensions);
    if (!sheetFields) return;

    const { sheetData } = sheetFields;
    const config = searCore.configEngine?.getDefaultConfig?.() as Partial<SheetConfig> | undefined;
    const font = createFontDescriptor({
      fontSize: config?.sheetCellFontSize ?? 10,
      fontFamily: config?.sheetCellFontFamily ?? 'sans-serif',
    });
    const selectedIndices = getSelectedIndices(
      searCore,
      handle.type,
      handle.primaryIndex,
      this.#stateOwner.getState().dimensions,
    );
    const indices = selectedIndices ?? [handle.primaryIndex];
    if (indices.length === 0) return;
    const PADDING = 16;

    const measureCell = (
      cellData: { type: string | symbol; value?: unknown; formula?: string },
      row: number,
      col: number,
    ) => {
      const context = searCore.renderEngine.renderCoordinatorManager.createCellContext(row, col);
      const format = sheetFields.cellFormats?.getItem(row, col);
      const text = this.#displayTextRegistry.getDisplayText(
        format === null ? cellData : { ...cellData, format },
        context,
      );
      if (!text) return null;
      const plainMetrics = this.#measureCellMetrics(text, font);
      if (cellData.type !== CellType.RichText || !Array.isArray(cellData.value)) return plainMetrics;
      const richMetrics = this.#embeddedEditor?.measureUnwrapped?.(cellData.value as SheetDocumentNode[], font);
      return richMetrics
        ? {
            width: Math.max(plainMetrics.width, richMetrics.width),
            height: Math.max(plainMetrics.height, richMetrics.height),
          }
        : plainMetrics;
    };

    let sizes: SheetDimensionResizeInput[] = [];

    if (handle.type === ResizeAxis.Column) {
      const selectedColumns = new Set(indices);
      const maxWidths = new Map<number, number>(indices.map((index) => [index, 0]));

      // One sparse scan serves every selected column; do not scan the
      // full row count once for each column.
      sheetData.forEachStored((cellData, row, col) => {
        if (!selectedColumns.has(col)) return;
        const info = measureCell(cellData, row, col);
        if (info) maxWidths.set(col, Math.max(maxWidths.get(col) ?? 0, info.width));
      });
      this.#projectedCells?.forEachProjectedCellInRange(
        0,
        Math.min(...indices),
        readSheetDataAxisCount(sheetData, 0) - 1,
        Math.max(...indices),
        (cellData, row, col) => {
          if (!selectedColumns.has(col) || sheetData.getItem(row, col) != null) return;
          const info = measureCell(cellData, row, col);
          if (info) maxWidths.set(col, Math.max(maxWidths.get(col) ?? 0, info.width));
        },
      );

      for (const idx of indices) {
        const maxWidth = maxWidths.get(idx) ?? 0;
        if (maxWidth > 0) sizes.push({ index: idx, size: maxWidth + PADDING });
      }
    } else {
      for (const idx of indices) {
        let maxHeight = 0;
        sheetData.forEachStoredInRow(idx, (cellData, col) => {
          const info = measureCell(cellData, idx, col);
          if (info) maxHeight = Math.max(maxHeight, info.height);
        });
        this.#projectedCells?.forEachProjectedCellInRange(
          idx,
          0,
          idx,
          readSheetDataAxisCount(sheetData, 1) - 1,
          (cellData, row, col) => {
            if (sheetData.getItem(row, col) != null) return;
            const info = measureCell(cellData, row, col);
            if (info) maxHeight = Math.max(maxHeight, info.height);
          },
        );
        if (maxHeight > 0) sizes.push({ index: idx, size: maxHeight + PADDING });
      }
    }

    if (sizes.length === 0) return;
    this.#runCommand(searCore, handle.type === ResizeAxis.Row ? ResizeSheetRowsCommand : ResizeSheetColumnsCommand, {
      sizes,
    });
  }

  #measureCellMetrics(text: string, font: string): { width: number; height: number } {
    const lines = text.split('\n');
    let width = 0;
    let height = 0;
    for (const line of lines) {
      const shaped = this.#textShaper.shape({ text: line || ' ', font });
      if (line) width = Math.max(width, shaped.width);
      height += shaped.height;
    }
    return { width, height };
  }

  #runCommand<Input>(_searCore: SearCoreSheet, definition: SheetCommandDefinition<Input>, input: Input): void {
    const commands = this.#resolveCommandBus('runCommand');
    if (!commands) return;
    this.#commandCore = _searCore;
    try {
      commands.run(definition, input);
    } finally {
      this.#commandCore = null;
    }
  }

  #resolveCommandBus(method: string): SheetCommandBus | null {
    if (this.#registeredCommandBus) return this.#registeredCommandBus;
    if (this.#commands) return this.#commands;
    this.#platform?.warn(`SheetResizePlugin ${method} skipped: SheetCommandBus is missing.`);
    return null;
  }

  /** Renders SheetResizePlugin scene output. */
  public render(searCore: SearCoreSheet): Node<CellProperties>[] | null {
    const nodes: Node<CellProperties>[] = [];
    const markerNodes = this.#renderHiddenMarkers(searCore);
    if (markerNodes) nodes.push(...markerNodes);

    const state = this.#dragState;
    if (state.isDragging && state.dragTarget && state.dragStartWorld && state.currentWorld) {
      const { type, primaryIndex, initialSizes } = state.dragTarget;
      const initialSize = initialSizes.get(primaryIndex) ?? 0;
      const { scrollManager } = searCore.renderEngine;
      const [viewportWidth, viewportHeight] = scrollManager.getShape();
      const scrollState = scrollManager.getState();

      let line: { x1: number; y1: number; x2: number; y2: number };
      const sheetFields = readResizeSheetFields(searCore, this.#stateOwner.getState().dimensions);
      if (!sheetFields) return nodes.length > 0 ? nodes : null;

      if (type === ResizeAxis.Row) {
        const deltaY = state.currentWorld.y - state.dragStartWorld.y;
        const newSize = Math.max(MIN_ROW_HEIGHT, initialSize + deltaY);

        const rowTop = sheetFields.rowSizes.getDimensionLeftBoundaryByIndex(primaryIndex) + HEADER_HEIGHT;
        const lineY = rowTop + newSize;

        line = {
          x1: scrollState.x,
          y1: lineY,
          x2: scrollState.x + viewportWidth,
          y2: lineY,
        };
      } else {
        const deltaX = state.currentWorld.x - state.dragStartWorld.x;
        const newSize = Math.max(MIN_COL_WIDTH, initialSize + deltaX);

        const colLeft = sheetFields.columnSizes.getDimensionLeftBoundaryByIndex(primaryIndex) + HEADER_WIDTH;
        const lineX = colLeft + newSize;

        line = {
          x1: lineX,
          y1: scrollState.y,
          x2: lineX,
          y2: scrollState.y + viewportHeight,
        };
      }

      const lineNode = createDragGuideNode<CellProperties>(line, {
        type: 'resize-guide',
        depth: this.depth + 10,
      });

      nodes.push(lineNode);
    }

    return nodes.length > 0 ? nodes : null;
  }

  #renderHiddenMarkers(searCore: SearCoreSheet): Node<CellProperties>[] | null {
    const sheetFields = readResizeSheetFields(searCore, this.#stateOwner.getState().dimensions);
    if (!sheetFields) return null;

    const { rowSizes, columnSizes } = sheetFields;
    const nodes: Node<CellProperties>[] = [];
    const markerDepth = this.depth + 20;

    sheetFields.rowHiddenOriginalSizes.forEachStored((_value, _row, rowIndex) => {
      const rowBoundary = rowSizes.getDimensionRightBoundaryByIndex(rowIndex);
      const cy = rowBoundary + HEADER_HEIGHT;
      const cx = Math.round(HEADER_WIDTH / 2);

      const triW = 8;
      const triH = 4;
      const gap = 2;

      const upPoints: [number, number][] = [
        [cx, cy - gap - triH],
        [cx - Math.round(triW / 2), cy - gap],
        [cx + Math.round(triW / 2), cy - gap],
      ];
      nodes.push(
        new TriangleNode<CellProperties>(
          new PositionRect(cx - Math.round(triW / 2), cy - gap - triH, triW, triH),
          {
            type: 'hidden-row-up',
            fill: this.#MARKER_STROKE,
            depth: markerDepth + 1,
            left: 0,
            skipHit: true,
          },
          upPoints,
        ),
      );

      const downPoints: [number, number][] = [
        [cx - Math.round(triW / 2), cy + gap],
        [cx + Math.round(triW / 2), cy + gap],
        [cx, cy + gap + triH],
      ];
      nodes.push(
        new TriangleNode<CellProperties>(
          new PositionRect(cx - Math.round(triW / 2), cy + gap, triW, triH),
          {
            type: 'hidden-row-down',
            fill: this.#MARKER_STROKE,
            depth: markerDepth + 1,
            left: 0,
            skipHit: true,
          },
          downPoints,
        ),
      );
    });

    sheetFields.columnHiddenOriginalSizes.forEachStored((_value, _row, colIndex) => {
      const colBoundary = columnSizes.getDimensionRightBoundaryByIndex(colIndex);
      const cx = colBoundary + HEADER_WIDTH;
      const cy = Math.round(HEADER_HEIGHT / 2);

      const triW = 4;
      const triH = 8;
      const gap = 2;

      const leftPoints: [number, number][] = [
        [cx - gap - triW, cy],
        [cx - gap, cy - Math.round(triH / 2)],
        [cx - gap, cy + Math.round(triH / 2)],
      ];
      nodes.push(
        new TriangleNode<CellProperties>(
          new PositionRect(cx - gap - triW, cy - Math.round(triH / 2), triW, triH),
          {
            type: 'hidden-col-left',
            fill: this.#MARKER_STROKE,
            depth: markerDepth + 1,
            top: 0,
            skipHit: true,
          },
          leftPoints,
        ),
      );

      const rightPoints: [number, number][] = [
        [cx + gap, cy - Math.round(triH / 2)],
        [cx + gap + triW, cy],
        [cx + gap, cy + Math.round(triH / 2)],
      ];
      nodes.push(
        new TriangleNode<CellProperties>(
          new PositionRect(cx + gap, cy - Math.round(triH / 2), triW, triH),
          {
            type: 'hidden-col-right',
            fill: this.#MARKER_STROKE,
            depth: markerDepth + 1,
            top: 0,
            skipHit: true,
          },
          rightPoints,
        ),
      );
    });

    return nodes.length > 0 ? nodes : null;
  }

  /**
   * Marks the visible viewport dirty after row or column resize operations.
   * @param searCore - Sheet core containing render and scroll services.
   * @param transaction - Transaction to inspect for resize operations.
   * @returns Viewport dirty rectangle when a resize occurred, otherwise null.
   */
  public dirtyRect(searCore: SearCoreSheet, transaction: Transaction): PositionRect<unknown> | null {
    const hasResize = transaction.operations.some(
      (operation) => isResizeRowOperation(operation) || isResizeColOperation(operation),
    );
    if (!hasResize) return null;

    const { scrollManager } = searCore.renderEngine;
    const [viewportWidth, viewportHeight] = scrollManager.getShape();
    const scrollState = scrollManager.getState();
    return new PositionRect(scrollState.x, scrollState.y, viewportWidth, viewportHeight);
  }
}
