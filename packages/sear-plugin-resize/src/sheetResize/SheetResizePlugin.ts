import { SearError } from '@searsuite/sear-foundation-error';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { Plugin, PluginKey, type PluginDocumentStateContribution } from '@searsuite/sear-assembly-plugin';
import { SearCoreSheet, SheetMatrix } from '@searsuite/sear-assembly-core';
import {
  DataEngine,
  SheetDataFieldNamespace,
  SheetColumnHiddenOriginalSizesFieldKey,
  SheetColumnSizesFieldKey,
  SheetRowHiddenOriginalSizesFieldKey,
  SheetRowSizesFieldKey,
  readSheetColumnHiddenOriginalSizes,
  readSheetColumnSizes,
  readSheetDataMatrix,
  readSheetRowHiddenOriginalSizes,
  readSheetRawRowSizes,
  readSheetRowSizes,
} from '@searsuite/sear-render-engine';
import { readSheetCellAlignments } from '@searsuite/sear-plugin-alignment';
import { readSheetCellFormats, type CellFormatMatrix } from '@searsuite/sear-plugin-cell-format';
import { CellProperties, CellRegion } from '@searsuite/sear-render-registry';
import { EventWithOffsetAndTarget } from '@searsuite/sear-render-event-engine';
import { SheetCommandBus, type SheetCommandDefinition } from '@searsuite/sear-assembly-commands';
import { type SheetConfig } from '@searsuite/sear-assembly-config';
import { createDragGuideNode, type ClipRegion, type Node, type NodeProperties } from '@searsuite/sear-render-node';
import { PositionRect, Rect as RectRange } from '@searsuite/sear-foundation-rect';
import { registerSheetResizeCommands } from '../SheetResizeCommandRegistration';
import {
  ResizeSheetColumnsCommand,
  ResizeSheetRowsCommand,
  HideSheetColumnsCommand,
  HideSheetRowsCommand,
  UnhideSheetColumnsCommand,
  UnhideSheetRowsCommand,
  type SheetDimensionResizeInput,
  type SheetResizeDimensionCommandDataSource,
} from '../SheetResizeDimensionCommands';
import {
  MatrixOT,
  MatrixOTActionName,
  MatrixTransactionOT,
  MatrixTransactionOTRelation,
  isResizeColOperation,
  isResizeRowOperation,
  type Operation,
} from '@searsuite/sear-domain-ot';
import {
  ColumnShapeDimensionsCSRMatrix,
  CSRMatrix,
  RowShapeDimensionsCSRMatrix,
  deserializeSparseMatrix,
  serializeSparseMatrix,
  type DimensionsCSRMatrix,
} from '@searsuite/sear-domain-matrix';
import { CoordinateEngine } from '@searsuite/sear-render-coord';
import {
  CursorEngine,
  CursorRegistry,
  CursorToken,
  type CursorPosition,
  type PositionCursorRule,
} from '@searsuite/sear-render-cursor';
import { SheetSelectionPlugin } from '@searsuite/sear-plugin-selection';
import { type PositionRectProps } from '@searsuite/sear-foundation-rect';
import { createFontDescriptor, TextShaper } from '@searsuite/sear-render-metrics';
import { CellType } from '@searsuite/sear-domain-cell-types';
import { SheetEmbeddedEditor, type SheetDocumentNode } from '@searsuite/sear-sheet-editor-contract';
import {
  BeginSheetResizeDragCommand,
  EndSheetResizeDragCommand,
  UpdateSheetResizeDragCommand,
  type SheetBeginResizeDragInput,
  type SheetUpdateResizeDragInput,
} from '../SheetResizeCommands';
import { Platform } from '@searsuite/sear-foundation-platform';
import { Transaction } from '@searsuite/sear-domain-transaction';
import { KeyboardRouter, PointerCapture, type PointerCapturePoint } from '@searsuite/sear-render-input';
import { TriangleNode } from '../TriangleNode';
import { createInvertibleDimensionOperationSet, hasInvertibleDimensionOperations } from './SheetResizeOperations';

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

interface ResizeSheetFields {
  sheetData: SheetMatrix;
  rowSizes: DimensionsCSRMatrix;
  columnSizes: DimensionsCSRMatrix;
  cellAlignments: { getItem(row: number, col: number): string | null };
  rowHiddenOriginalSizes: CSRMatrix<number>;
  columnHiddenOriginalSizes: CSRMatrix<number>;
  cellFormats: CellFormatMatrix | null;
}

/** Resize-owned dimension matrices accepted by SheetResizePlugin during setup. */
export interface SheetResizeDimensions {
  /** Row dimension matrix used for row height state. */
  rowSizes: DimensionsCSRMatrix;
  /** Column dimension matrix used for column width state. */
  columnSizes: DimensionsCSRMatrix;
  /** Original row sizes captured while rows are hidden. */
  rowHiddenOriginalSizes: CSRMatrix<number>;
  /** Original column sizes captured while columns are hidden. */
  columnHiddenOriginalSizes: CSRMatrix<number>;
}

function readDimensionCount(dimensions: DimensionsCSRMatrix, fallback: number): number {
  const shape = dimensions.shape as readonly number[] | undefined;
  const count = shape?.[1];
  if (typeof count === 'number' && Number.isInteger(count) && count > 0) return count;
  if (Number.isInteger(fallback) && fallback > 0) return fallback;
  if (count === 0 && fallback !== 0 && fallback !== Number.MAX_SAFE_INTEGER) return count;
  return Number.MAX_SAFE_INTEGER;
}

function readSheetDataAxisCount(sheetData: SheetMatrix, axis: 0 | 1): number {
  const shape = (sheetData as { readonly shape?: readonly number[] }).shape;
  const count = shape?.[axis];
  return typeof count === 'number' && Number.isInteger(count) && count >= 0 ? count : Number.MAX_SAFE_INTEGER;
}

function readDimensionValue(dimensions: DimensionsCSRMatrix, index: number, fallback: number): number {
  const reader = dimensions as DimensionsCSRMatrix & {
    getDefaultValue?(): number | null | undefined;
  };
  return reader.getItem?.(0, index) ?? reader.getDefaultValue?.() ?? fallback;
}

const cellDisplayTextRegistrySymbol = Symbol.for('CellDisplayTextRegistry');

const key = new PluginKey('SheetResize');
const ResizeCursorRuleKey = {
  HiddenMarker: Symbol('SheetResizePlugin.hidden-marker'),
  RowHandle: Symbol('SheetResizePlugin.row-handle'),
  ColumnHandle: Symbol('SheetResizePlugin.column-handle'),
} as const;
const ResizeAxis = {
  Row: 'row',
  Column: 'col',
} as const;

type ResizeAxis = (typeof ResizeAxis)[keyof typeof ResizeAxis];

interface DragTarget {
  type: ResizeAxis;
  primaryIndex: number;
  initialSizes: Map<number, number>;
}

interface ResizeState {
  dimensions: SheetResizeDimensions | null;
}

interface ResizeDragState {
  isDragging: boolean;
  dragTarget: DragTarget | null;
  dragStartWorld: { x: number; y: number } | null;
  currentWorld: { x: number; y: number } | null;
}

interface RowSizesDocumentState {
  rowSizes: RowShapeDimensionsCSRMatrix;
}

interface ColumnSizesDocumentState {
  columnSizes: ColumnShapeDimensionsCSRMatrix;
}

interface RowHiddenOriginalSizesDocumentState {
  rowHiddenOriginalSizes?: CSRMatrix<number>;
}

interface ColumnHiddenOriginalSizesDocumentState {
  columnHiddenOriginalSizes?: CSRMatrix<number>;
}

/** Pointer expressed in both sheet-world and viewport coordinates. */
interface ResizePointer {
  world: { x: number; y: number };
  view: { x: number; y: number };
  region?: CellProperties['region'];
}

/** Owns row and column resize state, interaction, and visual feedback. */
@Injectable()
export class SheetResizePlugin extends Plugin<SearCoreSheet, CellProperties, ResizeState> {
  /** DI token for resolving SheetResizePlugin. */
  public static readonly symbol: symbol = Symbol.for('SheetResizePlugin');
  /** Stable plugin key shared by all resize plugin instances. */
  public static readonly pluginKey = key;
  /** @inheritdoc */
  public override depth: number = 100;
  /** Resize transactions share the registered MatrixOT algebra. */
  public override readonly transactionOT = {
    ownerId: 'sheet.resize',
    definition: MatrixTransactionOT,
    relations: [MatrixTransactionOTRelation],
    collaborative: true,
  };
  /** Document-state export contributions for resize-owned dimensions. */
  public static readonly documentState = [
    {
      key: 'sheet.rowSizes',
      capture: (state: ResizeState) =>
        state.dimensions ? { rowSizes: state.dimensions.rowSizes.clone() as RowShapeDimensionsCSRMatrix } : undefined,
      codec: {
        key: 'sheet.rowSizes',
        serialize: (state: RowSizesDocumentState) => serializeSparseMatrix(state.rowSizes),
        deserialize: (payload, path) => ({
          rowSizes: deserializeSparseMatrix<number, RowShapeDimensionsCSRMatrix>(
            payload,
            RowShapeDimensionsCSRMatrix,
            path,
          ),
        }),
      },
    },
    {
      key: 'sheet.columnSizes',
      capture: (state: ResizeState) =>
        state.dimensions
          ? { columnSizes: state.dimensions.columnSizes.clone() as ColumnShapeDimensionsCSRMatrix }
          : undefined,
      codec: {
        key: 'sheet.columnSizes',
        serialize: (state: ColumnSizesDocumentState) => serializeSparseMatrix(state.columnSizes),
        deserialize: (payload, path) => ({
          columnSizes: deserializeSparseMatrix<number, ColumnShapeDimensionsCSRMatrix>(
            payload,
            ColumnShapeDimensionsCSRMatrix,
            path,
          ),
        }),
      },
    },
    {
      key: 'sheet.rowHiddenOriginalSizes',
      capture: (state: ResizeState) =>
        state.dimensions ? { rowHiddenOriginalSizes: state.dimensions.rowHiddenOriginalSizes.clone() } : undefined,
      codec: {
        key: 'sheet.rowHiddenOriginalSizes',
        serialize: (state: RowHiddenOriginalSizesDocumentState) =>
          state.rowHiddenOriginalSizes === void 0 ? void 0 : serializeSparseMatrix(state.rowHiddenOriginalSizes),
        deserialize: (payload, path) => ({
          rowHiddenOriginalSizes: deserializeSparseMatrix<number, CSRMatrix<number>>(payload, CSRMatrix, path),
        }),
      },
    },
    {
      key: 'sheet.columnHiddenOriginalSizes',
      capture: (state: ResizeState) =>
        state.dimensions
          ? { columnHiddenOriginalSizes: state.dimensions.columnHiddenOriginalSizes.clone() }
          : undefined,
      codec: {
        key: 'sheet.columnHiddenOriginalSizes',
        serialize: (state: ColumnHiddenOriginalSizesDocumentState) =>
          state.columnHiddenOriginalSizes === void 0 ? void 0 : serializeSparseMatrix(state.columnHiddenOriginalSizes),
        deserialize: (payload, path) => ({
          columnHiddenOriginalSizes: deserializeSparseMatrix<number, CSRMatrix<number>>(payload, CSRMatrix, path),
        }),
      },
    },
  ] satisfies readonly PluginDocumentStateContribution<ResizeState, object>[];

  /** SheetResizePlugin owns persisted dimension export modules. */
  public override readonly documentState = SheetResizePlugin.documentState;
  /** Resize owns dimension OT and tracks sheet-structure shifts. */
  public override interestedIn: string[] = [
    MatrixOTActionName.ResizeRow,
    MatrixOTActionName.ResizeCol,
    MatrixOTActionName.RowInsert,
    MatrixOTActionName.RowDelete,
    MatrixOTActionName.RowMove,
    MatrixOTActionName.ColInsert,
    MatrixOTActionName.ColDelete,
    MatrixOTActionName.ColMove,
  ];

  private readonly HEADER_WIDTH = 50;
  private readonly HEADER_HEIGHT = 24;
  private readonly HANDLE_SIZE = 8;
  private readonly MIN_ROW_HEIGHT = 0;
  private readonly MIN_COL_WIDTH = 0;
  private readonly MARKER_STROKE = 'rgba(56, 110, 246, 0.9)';
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
    @Inject(CoordinateEngine.symbol)
    private readonly coordEngine: CoordinateEngine,
    @Inject(CursorEngine.symbol)
    private readonly cursorEngine: CursorEngine,
    @Inject(TextShaper.symbol)
    private readonly textShaper: TextShaper,
    @Inject(cellDisplayTextRegistrySymbol)
    private readonly displayTextRegistry: CellDisplayTextReader,
    @Inject(PointerCapture.symbol)
    private readonly pointerCapture: PointerCapture,
    @Inject(SheetCommandBus.symbol)
    private readonly commands?: SheetCommandBus,
    @Inject(Platform.symbol)
    private readonly platform?: Platform,
    @Inject(CursorRegistry.symbol)
    cursorRegistry?: CursorRegistry,
    dimensions: SheetResizeDimensions | null = null,
    @Inject(DataEngine.symbol)
    private readonly commandDataEngine?: DataEngine,
    @Inject(SheetEmbeddedEditor.symbol)
    private readonly embeddedEditor?: SheetEmbeddedEditor,
    @Inject(KeyboardRouter.symbol)
    private readonly keyboardRouter?: KeyboardRouter,
  ) {
    super({
      key,
      state: { dimensions },
    });
    this.#unregisterCursorPositionRules = this.registerCursorPositionRules(cursorRegistry);
  }

  /** Registers the commands. */
  public registerCommands(commands: SheetCommandBus): void {
    if (this.#registeredCommandBus && this.#registeredCommandBus !== commands) {
      throw new SearError('Sheet resize commands are already bound to an editor.');
    }
    this.#registeredCommandBus = commands;
    registerSheetResizeCommands(commands, this.createResizeDimensionCommandDataSource(), this);
    this.keyboardRouter?.subscribe({
      onHideRows: () => this.hideSelectedAxis('row'),
      onHideColumns: () => this.hideSelectedAxis('column'),
    });
  }

  private hideSelectedAxis(axis: 'row' | 'column'): void {
    const range = this.commandDataEngine?.getDataType<[RectRange, RectRange]>(SheetSelectionPlugin.pluginKey)?.[1];
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
      dragTarget: drag.dragTarget ? {
        ...drag.dragTarget,
        initialSizes: new Map(drag.dragTarget.initialSizes),
      } : null,
      dragStartWorld: drag.dragStartWorld ? { ...drag.dragStartWorld } : null,
      currentWorld: drag.currentWorld ? { ...drag.currentWorld } : null,
    };
  }

  #assertDragCommand(): void {
    if (this.#registeredCommandBus && !this.#registeredCommandBus.isExecuting()) {
      throw new SearError('Sheet resize drag changes must run through a command.');
    }
  }

  /**
   * Installs the dimension matrices owned by this resize plugin instance.
   * @param dimensions - Shared row, column, and hidden-size matrices for the sheet.
   */
  public setResizeDimensions(dimensions: SheetResizeDimensions): void {
    this.setState({ ...this.getState(), dimensions });
  }

  /** Includes sparse derived display cells in auto-fit measurements. */
  public setProjectedCells(source: SheetResizeProjectedCells): void {
    this.#projectedCells = source;
  }

  /** @inheritdoc */
  public override onMouseMove(
    searCore: SearCoreSheet,
    _event: EventWithOffsetAndTarget<CellProperties>,
  ): boolean | void {
    const pointer = this.getResizePointer(_event);
    const { world } = pointer;
    const state = this.#dragState;

    if (state.isDragging && state.dragTarget && state.dragStartWorld) {
      this.runCommand(searCore, UpdateSheetResizeDragCommand, { world: { x: world.x, y: world.y } });
      return false;
    }

    // Cursor presentation is resolved by SheetCursorPlugin from the position
    // rules registered in this constructor. Keeping this plugin out of the
    // normal apply path makes cursor precedence independent of plugin order.
  }

  /** @inheritdoc */
  public override onMouseDown(
    searCore: SearCoreSheet,
    _event: EventWithOffsetAndTarget<CellProperties>,
  ): boolean | void {
    const pointer = this.getResizePointer(_event);
    const { world } = pointer;

    const unhideIndex = this.detectHiddenMarkerClick(searCore, pointer);
    if (unhideIndex !== null) {
      this.dispatchUnhide(searCore, unhideIndex.type, unhideIndex.index);
      return false;
    }

    const handle = this.detectResizeHandle(searCore, pointer);

    if (handle) {
      if ((_event.clickCount ?? 0) >= 2) {
        this.dispatchAutoFit(searCore, handle);
        this.#shouldConsumeNextDoubleClick = true;
        return false;
      }

      const cursor: CursorToken = handle.type === ResizeAxis.Row ? CursorToken.RowResize : CursorToken.ColumnResize;
      this.cursorEngine.override(cursor);

      const selectedIndices = this.getSelectedIndices(searCore, handle.type, handle.primaryIndex);
      const initialSizes = new Map<number, number>();
      const sheetFields = this.readResizeSheetFields(searCore);
      if (selectedIndices) {
        const sizes = handle.type === ResizeAxis.Row ? sheetFields?.rowSizes : sheetFields?.columnSizes;
        const fallback = handle.type === ResizeAxis.Row ? this.MIN_ROW_HEIGHT : this.MIN_COL_WIDTH;
        for (const idx of selectedIndices) {
          initialSizes.set(idx, sizes?.getItem(0, idx) || fallback);
        }
      } else {
        const sizes = handle.type === ResizeAxis.Row ? sheetFields?.rowSizes : sheetFields?.columnSizes;
        const fallback = handle.type === ResizeAxis.Row ? this.MIN_ROW_HEIGHT : this.MIN_COL_WIDTH;
        initialSizes.set(handle.primaryIndex, sizes?.getItem(0, handle.primaryIndex) || fallback);
      }

      this.runCommand(searCore, BeginSheetResizeDragCommand, {
        axis: handle.type,
        primaryIndex: handle.primaryIndex,
        initialSizes: Array.from(initialSizes, ([index, size]) => ({ index, size })),
        world: { x: world.x, y: world.y },
      });
      this.startResizePointerCapture(searCore);
      return false;
    }
  }

  /** @inheritdoc */
  public override onMouseUp(searCore: SearCoreSheet, event: EventWithOffsetAndTarget<CellProperties>): void {
    this.finishResizeDrag(searCore, this.getResizePointer(event).world);
  }

  /** @inheritdoc */
  public override onDblClick(
    searCore: SearCoreSheet,
    _event: EventWithOffsetAndTarget<CellProperties>,
  ): boolean | void {
    if (this.#shouldConsumeNextDoubleClick) {
      this.#shouldConsumeNextDoubleClick = false;
      return false;
    }

    const pointer = this.getResizePointer(_event);
    const handle = this.detectResizeHandle(searCore, pointer);
    if (!handle) return;

    this.dispatchAutoFit(searCore, handle);
    return false;
  }

  private getSelectedIndices(searCore: SearCoreSheet, type: ResizeAxis, draggedIndex: number): number[] | null {
    const selectionState = searCore.pluginManager.getPluginState<[RectRange, RectRange]>(
      SheetSelectionPlugin.pluginKey,
    );
    if (!selectionState) return null;

    const bounds = selectionState[1];
    if (!bounds) return null;
    const [start, end] = [bounds.getPoint(0), bounds.getPoint(1)];
    if (!start || !end) return null;

    const sheetFields = this.readResizeSheetFields(searCore);
    if (!sheetFields) return null;

    if (type === ResizeAxis.Row) {
      const lastCol = sheetFields.columnSizes.shape[1] - 1;
      if (start[1] !== 0 || end[1] !== lastCol) return null;
      if (draggedIndex < start[0] || draggedIndex > end[0]) return null;
      const indices: number[] = [];
      for (let r = start[0]; r <= end[0]; r++) indices.push(r);
      return indices;
    }

    const lastRow = sheetFields.rowSizes.shape[1] - 1;
    if (start[0] !== 0 || end[0] !== lastRow) return null;
    if (draggedIndex < start[1] || draggedIndex > end[1]) return null;
    const indices: number[] = [];
    for (let c = start[1]; c <= end[1]; c++) indices.push(c);
    return indices;
  }

  private detectResizeHandle(searCore: SearCoreSheet, pointer: ResizePointer): DragTarget | null {
    const sheetFields = this.readResizeSheetFields(searCore);
    if (!sheetFields) return null;

    const { rowSizes, columnSizes } = sheetFields;
    const { world, view, region } = pointer;

    // Row and column headers are affixed on one axis.  Header membership
    // must be checked in viewport coordinates on that fixed axis, while
    // row/column boundaries remain sheet-world coordinates on the scroll
    // axis.  Using world coordinates for both made the header unreachable
    // after horizontal/vertical scrolling respectively.
    const isRowHeader = region === CellRegion.RowHeader || (view.x < this.HEADER_WIDTH && view.y >= this.HEADER_HEIGHT);
    const isColumnHeader =
      region === CellRegion.ColumnHeader || (view.y < this.HEADER_HEIGHT && view.x >= this.HEADER_WIDTH);

    if (isRowHeader) {
      const dataY = world.y - this.HEADER_HEIGHT;
      try {
        const rowIndex = rowSizes.getRightBoundaryColIndexByDimension(dataY);
        const rowBottom = rowSizes.getDimensionRightBoundaryByIndex(rowIndex) + this.HEADER_HEIGHT;
        if (Math.abs(world.y - rowBottom) <= this.HANDLE_SIZE) {
          const currentHeight = rowSizes.getItem(0, rowIndex) || this.MIN_ROW_HEIGHT;
          return {
            type: ResizeAxis.Row,
            primaryIndex: rowIndex,
            initialSizes: new Map([[rowIndex, currentHeight]]),
          };
        }
        if (rowIndex > 0) {
          const prevRowBottom = rowSizes.getDimensionRightBoundaryByIndex(rowIndex - 1) + this.HEADER_HEIGHT;
          if (Math.abs(world.y - prevRowBottom) <= this.HANDLE_SIZE) {
            const prevHeight = rowSizes.getItem(0, rowIndex - 1) || this.MIN_ROW_HEIGHT;
            return {
              type: ResizeAxis.Row,
              primaryIndex: rowIndex - 1,
              initialSizes: new Map([[rowIndex - 1, prevHeight]]),
            };
          }
        }
      } catch {}
    }

    if (isColumnHeader) {
      const dataX = world.x - this.HEADER_WIDTH;
      try {
        const colIndex = columnSizes.getRightBoundaryColIndexByDimension(dataX);
        const colRight = columnSizes.getDimensionRightBoundaryByIndex(colIndex) + this.HEADER_WIDTH;
        if (Math.abs(world.x - colRight) <= this.HANDLE_SIZE) {
          const currentWidth = columnSizes.getItem(0, colIndex) || this.MIN_COL_WIDTH;
          return {
            type: ResizeAxis.Column,
            primaryIndex: colIndex,
            initialSizes: new Map([[colIndex, currentWidth]]),
          };
        }
        if (colIndex > 0) {
          const prevColRight = columnSizes.getDimensionRightBoundaryByIndex(colIndex - 1) + this.HEADER_WIDTH;
          if (Math.abs(world.x - prevColRight) <= this.HANDLE_SIZE) {
            const prevWidth = columnSizes.getItem(0, colIndex - 1) || this.MIN_COL_WIDTH;
            return {
              type: ResizeAxis.Column,
              primaryIndex: colIndex - 1,
              initialSizes: new Map([[colIndex - 1, prevWidth]]),
            };
          }
        }
      } catch {}
    }

    return null;
  }

  private dispatchResize(
    searCore: SearCoreSheet,
    dragTarget: DragTarget,
    dragStartWorld: { x: number; y: number },
    currentWorld: { x: number; y: number },
  ): void {
    const { type, primaryIndex, initialSizes } = dragTarget;
    const delta = type === ResizeAxis.Row ? currentWorld.y - dragStartWorld.y : currentWorld.x - dragStartWorld.x;
    const minSize = type === ResizeAxis.Row ? this.MIN_ROW_HEIGHT : this.MIN_COL_WIDTH;
    const primarySize = initialSizes.get(primaryIndex);
    if (primarySize === undefined) return;
    const newSize = Math.max(minSize, primarySize + delta);

    const sizes: SheetDimensionResizeInput[] = [];
    for (const [idx, initial] of initialSizes) {
      sizes.push({ index: idx, size: newSize, previousSize: initial });
    }

    if (sizes.length === 0) return;
    this.runCommand(searCore, type === ResizeAxis.Row ? ResizeSheetRowsCommand : ResizeSheetColumnsCommand, { sizes });
  }

  private dispatchUnhide(searCore: SearCoreSheet, type: ResizeAxis, index: number): void {
    const sheetFields = this.readResizeSheetFields(searCore);
    const originalSize =
      type === ResizeAxis.Row
        ? sheetFields?.rowHiddenOriginalSizes.getItem(0, index)
        : sheetFields?.columnHiddenOriginalSizes.getItem(0, index);
    if (originalSize === void 0 || originalSize === null || originalSize === 0) return;
    this.runCommand(searCore, type === ResizeAxis.Row ? UnhideSheetRowsCommand : UnhideSheetColumnsCommand, { index });
  }

  private detectHiddenMarkerClick(
    searCore: SearCoreSheet,
    pointer: ResizePointer,
  ): { type: ResizeAxis; index: number } | null {
    const sheetFields = this.readResizeSheetFields(searCore);
    if (!sheetFields) return null;

    const { rowSizes, columnSizes } = sheetFields;
    const { world, view, region } = pointer;

    const isRowHeader = region === CellRegion.RowHeader || (view.x < this.HEADER_WIDTH && view.y >= this.HEADER_HEIGHT);
    const isColumnHeader =
      region === CellRegion.ColumnHeader || (view.y < this.HEADER_HEIGHT && view.x >= this.HEADER_WIDTH);

    if (isRowHeader) {
      const rowHidden = sheetFields.rowHiddenOriginalSizes;
      let hit: { type: ResizeAxis; index: number } | null = null;
      rowHidden.forEachStored((_value, _row, rowIndex) => {
        if (hit) return;
        const rowBoundary = rowSizes.getDimensionRightBoundaryByIndex(rowIndex) + this.HEADER_HEIGHT;
        if (Math.abs(world.y - rowBoundary) <= 6) {
          hit = { type: ResizeAxis.Row, index: rowIndex };
        }
      });
      if (hit) return hit;
    }

    if (isColumnHeader) {
      const columnHidden = sheetFields.columnHiddenOriginalSizes;
      let hit: { type: ResizeAxis; index: number } | null = null;
      columnHidden.forEachStored((_value, _row, colIndex) => {
        if (hit) return;
        const colBoundary = columnSizes.getDimensionRightBoundaryByIndex(colIndex) + this.HEADER_WIDTH;
        if (Math.abs(world.x - colBoundary) <= 6) {
          hit = { type: ResizeAxis.Column, index: colIndex };
        }
      });
      if (hit) return hit;
    }

    return null;
  }

  /**
   * Resolves an input point for mixed-coordinate header interactions.
   * Sticky header axes use view coordinates; the scrolling axes use world
   * coordinates so dimension boundaries still refer to the sheet model.
   */
  private getResizePointer(event?: EventWithOffsetAndTarget<CellProperties>): ResizePointer {
    if (event) {
      const { offsetX, offsetY } = event.origin;
      return {
        world: this.coordEngine.screenToWorld(offsetX, offsetY),
        view: this.coordEngine.screenToView(offsetX, offsetY),
        region: event.target?.properties.region,
      };
    }

    return {
      world: this.coordEngine.getCurrentMouseWorld(),
      view: this.coordEngine.getCurrentMouseView(),
    };
  }

  private startResizePointerCapture(searCore: SearCoreSheet): void {
    this.#disposePointerCapture?.();
    this.#disposePointerCapture = this.pointerCapture.start({
      onMove: (capturedEvent) => this.updateCapturedResizeDrag(searCore, capturedEvent),
      onRelease: (capturedEvent) => this.finishResizeDrag(searCore, this.getCapturedWorld(capturedEvent)),
    });
  }

  private updateCapturedResizeDrag(searCore: SearCoreSheet, event: PointerCapturePoint): void {
    const world = this.getCapturedWorld(event);
    if (!world) return;
    const state = this.#dragState;
    if (!state.isDragging || !state.dragTarget || !state.dragStartWorld) return;
    if (state.currentWorld && state.currentWorld.x === world.x && state.currentWorld.y === world.y) return;
    this.runCommand(searCore, UpdateSheetResizeDragCommand, { world });
  }

  private getCapturedWorld(event: PointerCapturePoint): { x: number; y: number } {
    return this.coordEngine.screenToWorld(event.view.x, event.view.y);
  }

  private finishResizeDrag(searCore: SearCoreSheet, currentWorld: { x: number; y: number } | null): void {
    const state = this.#dragState;
    this.#disposePointerCapture?.();
    this.#disposePointerCapture = null;

    if (state.isDragging && state.dragTarget && state.dragStartWorld && currentWorld) {
      this.dispatchResize(searCore, state.dragTarget, state.dragStartWorld, currentWorld);
      this.cursorEngine.override(null);
    }

    this.runCommand(searCore, EndSheetResizeDragCommand, void 0);
  }

  /** Converts a registry pointer context into the mixed-coordinate resize pointer representation. */
  private toResizePointer(position: {
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
  private registerCursorPositionRules(cursorRegistry?: CursorRegistry): (() => void)[] {
    if (!cursorRegistry) return [];
    return [
      cursorRegistry.registerPosition({
        key: ResizeCursorRuleKey.HiddenMarker,
        layer: 102,
        cursor: CursorToken.Pointer,
        test: this.isHiddenMarkerCursorTarget.bind(this),
      }),
      this.registerResizeHandleCursorRule(
        cursorRegistry,
        ResizeCursorRuleKey.RowHandle,
        ResizeAxis.Row,
        CursorToken.RowResize,
      ),
      this.registerResizeHandleCursorRule(
        cursorRegistry,
        ResizeCursorRuleKey.ColumnHandle,
        ResizeAxis.Column,
        CursorToken.ColumnResize,
      ),
    ];
  }

  /** Registers one axis-specific resize-handle rule using shared coordinate matching. */
  private registerResizeHandleCursorRule(
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
        return resizePlugin.getResizeHandleAtPosition(position)?.type === axis;
      },
    });
  }

  private isHiddenMarkerCursorTarget(position: CursorPosition): boolean {
    return this.detectHiddenMarkerClick(position.core, this.toResizePointer(position)) !== null;
  }

  /** Resolves a resize handle from the cursor registry's shared pointer context. */
  private getResizeHandleAtPosition(position: CursorPosition): DragTarget | null {
    return this.detectResizeHandle(position.core, this.toResizePointer(position));
  }

  private dispatchAutoFit(searCore: SearCoreSheet, handle: DragTarget): void {
    if (!this.textShaper) return;
    const sheetFields = this.readResizeSheetFields(searCore);
    if (!sheetFields) return;

    const { sheetData } = sheetFields;
    const config = searCore.configEngine?.getDefaultConfig?.() as Partial<SheetConfig> | undefined;
    const font = createFontDescriptor({
      fontSize: config?.sheetCellFontSize ?? 10,
      fontFamily: config?.sheetCellFontFamily ?? 'sans-serif',
    });
    const selectedIndices = this.getSelectedIndices(searCore, handle.type, handle.primaryIndex);
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
      const text = this.displayTextRegistry.getDisplayText(
        format === null ? cellData : { ...cellData, format },
        context,
      );
      if (!text) return null;
      const plainMetrics = this.measureCellMetrics(text, font);
      if (cellData.type !== CellType.RichText || !Array.isArray(cellData.value)) return plainMetrics;
      const richMetrics = this.embeddedEditor?.measureUnwrapped?.(cellData.value as SheetDocumentNode[], font);
      return richMetrics ? {
        width: Math.max(plainMetrics.width, richMetrics.width),
        height: Math.max(plainMetrics.height, richMetrics.height),
      } : plainMetrics;
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
        0, Math.min(...indices), readSheetDataAxisCount(sheetData, 0) - 1, Math.max(...indices),
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
          idx, 0, idx, readSheetDataAxisCount(sheetData, 1) - 1,
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
    this.runCommand(searCore, handle.type === ResizeAxis.Row ? ResizeSheetRowsCommand : ResizeSheetColumnsCommand, {
      sizes,
    });
  }

  private measureCellMetrics(text: string, font: string): { width: number; height: number } {
    const lines = text.split('\n');
    let width = 0;
    let height = 0;
    for (const line of lines) {
      const shaped = this.textShaper.shape({ text: line || ' ', font });
      if (line) width = Math.max(width, shaped.width);
      height += shaped.height;
    }
    return { width, height };
  }

  private runCommand<Input>(_searCore: SearCoreSheet, definition: SheetCommandDefinition<Input>, input: Input): void {
    const commands = this.resolveCommandBus('runCommand');
    if (!commands) return;
    this.#commandCore = _searCore;
    try {
      commands.run(definition, input);
    } finally {
      this.#commandCore = null;
    }
  }

  private resolveCommandBus(method: string): SheetCommandBus | null {
    if (this.#registeredCommandBus) return this.#registeredCommandBus;
    if (this.commands) return this.commands;
    this.platform?.warn(`SheetResizePlugin ${method} skipped: SheetCommandBus is missing.`);
    return null;
  }

  private createResizeDimensionCommandDataSource(): SheetResizeDimensionCommandDataSource {
    const resizePlugin = this;
    return {
      target: SheetResizePlugin.pluginKey,
      getRowCount(): number {
        const fields = resizePlugin.readRequiredResizeCommandFields();
        return readDimensionCount(fields.rowSizes, readSheetDataAxisCount(fields.sheetData, 0));
      },
      getColumnCount(): number {
        const fields = resizePlugin.readRequiredResizeCommandFields();
        return readDimensionCount(fields.columnSizes, readSheetDataAxisCount(fields.sheetData, 1));
      },
      getDefaultRowSize(): number {
        return resizePlugin.readRequiredResizeCommandFields().rowSizes.getDefaultValue() ?? 24;
      },
      getDefaultColumnSize(): number {
        return resizePlugin.readRequiredResizeCommandFields().columnSizes.getDefaultValue() ?? 80;
      },
      readRowSize(index: number): number {
        const rowSizes = resizePlugin.readRequiredResizeCommandFields().rowSizes;
        return readDimensionValue(rowSizes, index, 24);
      },
      readColumnSize(index: number): number {
        const columnSizes = resizePlugin.readRequiredResizeCommandFields().columnSizes;
        return readDimensionValue(columnSizes, index, 80);
      },
      readRowHiddenOriginalSize(index: number): number | null {
        return resizePlugin.readRequiredResizeCommandFields().rowHiddenOriginalSizes.getItem(0, index);
      },
      readColumnHiddenOriginalSize(index: number): number | null {
        return resizePlugin.readRequiredResizeCommandFields().columnHiddenOriginalSizes.getItem(0, index);
      },
    };
  }

  private readRequiredResizeCommandFields(): ResizeSheetFields {
    if (this.#commandCore) {
      const fields = this.readResizeSheetFields(this.#commandCore, true);
      if (fields) return fields;
    }
    if (this.commandDataEngine) {
      const fields = this.readResizeSheetFields({ getDataEngine: () => this.commandDataEngine } as SearCoreSheet, true);
      if (fields) return fields;
    }
    const dimensions = this.getState().dimensions;
    if (dimensions) {
      return {
        sheetData: new SheetMatrix(void 0, [dimensions.rowSizes.shape[1], dimensions.columnSizes.shape[1]]),
        rowSizes: dimensions.rowSizes,
        columnSizes: dimensions.columnSizes,
        cellAlignments: { getItem: () => null },
        cellFormats: null,
        rowHiddenOriginalSizes: dimensions.rowHiddenOriginalSizes,
        columnHiddenOriginalSizes: dimensions.columnHiddenOriginalSizes,
      };
    }
    throw new SearError('SheetResizePlugin resize command cannot read dimension fields.');
  }

  private readResizeSheetFields(searCore: SearCoreSheet, rawRows = false): ResizeSheetFields | null {
    const coreWithDataEngine = searCore as SearCoreSheet & {
      dataEngine?: DataEngine;
    };
    const dataEngine = searCore.getDataEngine?.() ?? coreWithDataEngine.dataEngine;
    if (dataEngine) {
      const sheetData = readSheetDataMatrix(dataEngine);
      const rowSizes = rawRows ? readSheetRawRowSizes(dataEngine) : readSheetRowSizes(dataEngine);
      const columnSizes = readSheetColumnSizes(dataEngine);
      const cellAlignments = readSheetCellAlignments(dataEngine);
      const cellFormats = readSheetCellFormats(dataEngine);
      const rowHiddenOriginalSizes = readSheetRowHiddenOriginalSizes(dataEngine);
      const columnHiddenOriginalSizes = readSheetColumnHiddenOriginalSizes(dataEngine);
      if (sheetData && rowSizes && columnSizes && rowHiddenOriginalSizes && columnHiddenOriginalSizes) {
        return {
          sheetData,
          rowSizes,
          columnSizes,
          cellAlignments: cellAlignments ?? { getItem: () => null },
          cellFormats,
          rowHiddenOriginalSizes,
          columnHiddenOriginalSizes,
        } as ResizeSheetFields;
      }
    }
    const dimensions = this.getState().dimensions;
    if (dimensions) {
      return {
        sheetData: new SheetMatrix(void 0, [dimensions.rowSizes.shape[1], dimensions.columnSizes.shape[1]]),
        rowSizes: dimensions.rowSizes,
        columnSizes: dimensions.columnSizes,
        cellAlignments: { getItem: () => null },
        cellFormats: null,
        rowHiddenOriginalSizes: dimensions.rowHiddenOriginalSizes,
        columnHiddenOriginalSizes: dimensions.columnHiddenOriginalSizes,
      };
    }
    return null;
  }

  /**
   * Applies dimension and hidden-size operations owned by the resize plugin.
   * @param pluginState - Current resize plugin state.
   * @param transaction - Transaction containing resize or sheet-structure operations.
   * @returns Updated plugin state, or null when the transaction does not affect dimensions.
   */
  public apply(pluginState: ResizeState, transaction: Transaction): ResizeState | null {
    const operationSet = createInvertibleDimensionOperationSet(
      pluginState.dimensions,
      transaction.operations as Operation[],
    );
    if (!operationSet || !hasInvertibleDimensionOperations(operationSet)) return null;

    const dimensions = pluginState.dimensions;
    if (!dimensions) return null;
    if (operationSet.rowSizes.length > 0) MatrixOT.apply(dimensions.rowSizes, operationSet.rowSizes);
    if (operationSet.columnSizes.length > 0) MatrixOT.apply(dimensions.columnSizes, operationSet.columnSizes);
    if (operationSet.rowHiddenOriginalSizes.length > 0) {
      MatrixOT.apply(dimensions.rowHiddenOriginalSizes, operationSet.rowHiddenOriginalSizes);
    }
    if (operationSet.columnHiddenOriginalSizes.length > 0) {
      MatrixOT.apply(dimensions.columnHiddenOriginalSizes, operationSet.columnHiddenOriginalSizes);
    }

    return pluginState;
  }

  /** Renders SheetResizePlugin scene output. */
  public render(searCore: SearCoreSheet): Node<CellProperties>[] | null {
    const nodes: Node<CellProperties>[] = [];
    const markerNodes = this.renderHiddenMarkers(searCore);
    if (markerNodes) nodes.push(...markerNodes);

    const state = this.#dragState;
    if (state.isDragging && state.dragTarget && state.dragStartWorld && state.currentWorld) {
      const { type, primaryIndex, initialSizes } = state.dragTarget;
      const initialSize = initialSizes.get(primaryIndex) ?? 0;
      const { scrollManager } = searCore.renderEngine;
      const [viewportWidth, viewportHeight] = scrollManager.getShape();
      const scrollState = scrollManager.getState();

      let line: { x1: number; y1: number; x2: number; y2: number };
      const sheetFields = this.readResizeSheetFields(searCore);
      if (!sheetFields) return nodes.length > 0 ? nodes : null;

      if (type === ResizeAxis.Row) {
        const deltaY = state.currentWorld.y - state.dragStartWorld.y;
        const newSize = Math.max(this.MIN_ROW_HEIGHT, initialSize + deltaY);

        const rowTop = sheetFields.rowSizes.getDimensionLeftBoundaryByIndex(primaryIndex) + this.HEADER_HEIGHT;
        const lineY = rowTop + newSize;

        line = {
          x1: scrollState.x,
          y1: lineY,
          x2: scrollState.x + viewportWidth,
          y2: lineY,
        };
      } else {
        const deltaX = state.currentWorld.x - state.dragStartWorld.x;
        const newSize = Math.max(this.MIN_COL_WIDTH, initialSize + deltaX);

        const colLeft = sheetFields.columnSizes.getDimensionLeftBoundaryByIndex(primaryIndex) + this.HEADER_WIDTH;
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

  private renderHiddenMarkers(searCore: SearCoreSheet): Node<CellProperties>[] | null {
    const sheetFields = this.readResizeSheetFields(searCore);
    if (!sheetFields) return null;

    const { rowSizes, columnSizes } = sheetFields;
    const nodes: Node<CellProperties>[] = [];
    const markerDepth = this.depth + 20;

    sheetFields.rowHiddenOriginalSizes.forEachStored((_value, _row, rowIndex) => {
      const rowBoundary = rowSizes.getDimensionRightBoundaryByIndex(rowIndex);
      const cy = rowBoundary + this.HEADER_HEIGHT;
      const cx = Math.round(this.HEADER_WIDTH / 2);

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
            fill: this.MARKER_STROKE,
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
            fill: this.MARKER_STROKE,
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
      const cx = colBoundary + this.HEADER_WIDTH;
      const cy = Math.round(this.HEADER_HEIGHT / 2);

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
            fill: this.MARKER_STROKE,
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
            fill: this.MARKER_STROKE,
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

  /** Returns the plugin config. */
  public getPluginConfig(): unknown {
    return {};
  }

  /** Registers the state. */
  public registerState() {
    const state = this.getState();
    return [
      {
        key: this.key,
        state,
        dataEngine: {
          dataView: [
            {
              viewKey: SheetDataFieldNamespace,
              fieldKey: SheetRowSizesFieldKey,
              select: function selectSheetRowSizes(resizeState: ResizeState) {
                return resizeState.dimensions?.rowSizes;
              },
            },
            {
              viewKey: SheetDataFieldNamespace,
              fieldKey: SheetColumnSizesFieldKey,
              select: function selectSheetColumnSizes(resizeState: ResizeState) {
                return resizeState.dimensions?.columnSizes;
              },
            },
            {
              viewKey: SheetDataFieldNamespace,
              fieldKey: SheetRowHiddenOriginalSizesFieldKey,
              select: function selectSheetRowHiddenOriginalSizes(resizeState: ResizeState) {
                return resizeState.dimensions?.rowHiddenOriginalSizes;
              },
            },
            {
              viewKey: SheetDataFieldNamespace,
              fieldKey: SheetColumnHiddenOriginalSizesFieldKey,
              select: function selectSheetColumnHiddenOriginalSizes(resizeState: ResizeState) {
                return resizeState.dimensions?.columnHiddenOriginalSizes;
              },
            },
          ],
        },
      },
    ];
  }

  /**
   * Marks the visible viewport dirty after row or column resize operations.
   * @param searCore - Sheet core containing render and scroll services.
   * @param transaction - Transaction to inspect for resize operations.
   * @returns Viewport dirty rectangle when a resize occurred, otherwise null.
   */
  public override dirtyRect(searCore: SearCoreSheet, transaction: Transaction): PositionRect<unknown> | null {
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
