import {
  HideSheetColumnsCommand,
  HideSheetRowsCommand,
  BeginSheetResizeDragCommand,
  EndSheetResizeDragCommand,
  ResizeSheetColumnsCommand,
  ResizeSheetRowsCommand,
  SheetResizePlugin,
  SheetColumnHiddenOriginalSizesFieldKey,
  SheetColumnSizesFieldKey,
  SheetRowHiddenOriginalSizesFieldKey,
  SheetRowSizesFieldKey,
  UpdateSheetResizeDragCommand,
  UnhideSheetColumnsCommand,
  UnhideSheetRowsCommand,
  createHideColumnOperations,
  createHideRowOperations,
  createResizeColumnOperations,
  createResizeRowOperations,
  createUnhideColumnOperations,
  createUnhideRowOperations,
  registerSheetResizeDragCommands,
  registerSheetResizeDimensionCommands,
  type SheetResizeDimensionCommandDataSource,
} from '../src';
import { MatrixOTActionName, type Operation } from '@searsuite/sear-domain-ot';
import { ColumnShapeDimensionsCSRMatrix, CSRMatrix, RowShapeDimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import { createTransaction, Transaction } from '@searsuite/sear-domain-transaction';
import { Container } from '@searsuite/sear-foundation-di';
import { ConfigEngine } from '@searsuite/sear-assembly-config';
import { Tree } from '@searsuite/sear-render-node';
import { SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { Pipeline } from '@searsuite/sear-assembly-core';
import { SheetDataFieldNamespace, SheetDataMatrixFieldKey } from '@searsuite/sear-render-engine';
import { SheetHorizontalAlignmentFieldKey } from '@searsuite/sear-plugin-alignment';
import { CursorRegistry, CursorToken } from '@searsuite/sear-render-cursor';
import { HeadlessPointerCapture, PointerCapture, type PointerCaptureHandlers } from '@searsuite/sear-render-input';
import { TextShaper } from '@searsuite/sear-render-metrics';

let container: Container;

interface ResizePluginInternals {
  getResizeState(): {
    isDragging: boolean;
    dragTarget: { type: 'row' | 'col'; primaryIndex: number; initialSizes: Map<number, number> } | null;
    dragStartWorld: { x: number; y: number } | null;
    currentWorld: { x: number; y: number } | null;
  };
  beginResizeDrag(input: {
    axis: 'row' | 'col'; primaryIndex: number;
    initialSizes: readonly { index: number; size: number }[];
    world: { x: number; y: number };
  }): void;
  updateResizeDrag(input: { world: { x: number; y: number } }): void;
  dispatchResize(
    core: object,
    target: {
      type: 'row' | 'col';
      primaryIndex: number;
      initialSizes: Map<number, number>;
    },
    start: { x: number; y: number },
    current: { x: number; y: number },
  ): void;
  dispatchUnhide(core: object, type: 'row' | 'col', index: number): void;
  dispatchAutoFit(
    core: object,
    target: {
      type: 'row' | 'col';
      primaryIndex: number;
      initialSizes: Map<number, number>;
    },
  ): void;
  getResizePointer(event?: { origin: { offsetX: number; offsetY: number } }): {
    world: { x: number; y: number };
    view: { x: number; y: number };
  };
  detectResizeHandle(
    core: object,
    pointer: {
      world: { x: number; y: number };
      view: { x: number; y: number };
      region?: string;
    },
  ): { type: 'row' | 'col'; primaryIndex: number; initialSizes: Map<number, number> } | null;
  getSelectedIndices(core: object, type: 'row' | 'col', draggedIndex: number): number[] | null;
  detectHiddenMarkerClick(
    core: object,
    pointer: {
      world: { x: number; y: number };
      view: { x: number; y: number };
      region?: string;
    },
  ): { type: 'row' | 'col'; index: number } | null;
  setState(state: object): void;
  onMouseDown(core: object, event: object): boolean | void;
  dirtyRect(core: object, transaction: Transaction): { x: number; y: number; width: number; height: number } | null;
  readResizeSheetFields(core: object): {
    sheetData: {
      shape: [number, number];
      getItem(row: number, col: number): unknown;
      forEachStored?(): void;
      forEachStoredInRow?(): void;
    };
    rowSizes: {
      shape: [number, number];
      getItem(row: number, col: number): unknown;
      getDimensionLeftBoundaryByIndex(index: number): number;
      getDimensionRightBoundaryByIndex(index: number): number;
      getLeftBoundaryColIndexByDimension(value: number): number;
      getRightBoundaryColIndexByDimension(value: number): number;
    };
    columnSizes: {
      shape: [number, number];
      getItem(row: number, col: number): unknown;
      getDimensionLeftBoundaryByIndex(index: number): number;
      getDimensionRightBoundaryByIndex(index: number): number;
      getLeftBoundaryColIndexByDimension(value: number): number;
      getRightBoundaryColIndexByDimension(value: number): number;
    };
    cellAlignments: { getItem(row: number, col: number): unknown };
    rowHiddenOriginalSizes: { getItem(row: number, col: number): unknown; forEachStored?(): void };
    columnHiddenOriginalSizes: { getItem(row: number, col: number): unknown; forEachStored?(): void };
  } | null;
}

class TestPointerCapture extends PointerCapture {
  public capture: PointerCaptureHandlers | null = null;

  public override start(handlers: PointerCaptureHandlers): () => void {
    this.capture = handlers;
    return () => {
      if (this.capture === handlers) this.capture = null;
    };
  }

  public override stop(): void {
    this.capture = null;
  }
}

let currentCore: { executePipeline: (pipeline: Pipeline) => void } | null = null;

function createHiddenOriginalSizeMatrix(values: Array<[number, number]> = []) {
  const map = new Map(values);
  return {
    getItem: jest.fn((_row: number, index: number) => map.get(index) ?? null),
    forEachStored: jest.fn((callback: (value: number, row: number, col: number) => void) => {
      map.forEach((value, index) => callback(value, 0, index));
    }),
  };
}

function withDimensionDefaults<T extends object>(matrix: T | undefined, defaults: T): T {
  if (!matrix) return defaults;
  return new Proxy(matrix, {
    get(target, property, receiver) {
      if (property in target) {
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return Reflect.get(defaults, property, receiver);
    },
  });
}

function createResizeDataEngine({
  sheetData = {
    shape: [10, 10] as [number, number],
    getItem: jest.fn(() => null),
    forEachStored: jest.fn(),
    forEachStoredInRow: jest.fn(),
  },
  rowSizes,
  columnSizes,
  cellAlignments = { getItem: jest.fn(() => null) },
  rowHiddenOriginalSizes = createHiddenOriginalSizeMatrix(),
  columnHiddenOriginalSizes = createHiddenOriginalSizeMatrix(),
}: {
  sheetData?: unknown;
  rowSizes?: object;
  columnSizes?: object;
  cellAlignments?: unknown;
  rowHiddenOriginalSizes?: unknown;
  columnHiddenOriginalSizes?: unknown;
} = {}) {
  const rowSizeFields = withDimensionDefaults(rowSizes, {
    shape: [1, 10] as [number, number],
    getItem: jest.fn(() => 24),
    getDimensionLeftBoundaryByIndex: jest.fn((index: number) => index * 24),
    getDimensionRightBoundaryByIndex: jest.fn((index: number) => (index + 1) * 24),
    getLeftBoundaryColIndexByDimension: jest.fn((value: number) => Math.floor(value / 24)),
    getRightBoundaryColIndexByDimension: jest.fn((value: number) => Math.floor(value / 24)),
    getDefaultValue: jest.fn(() => 24),
  });
  const columnSizeFields = withDimensionDefaults(columnSizes, {
    shape: [1, 10] as [number, number],
    getItem: jest.fn(() => 100),
    getDimensionLeftBoundaryByIndex: jest.fn((index: number) => index * 100),
    getDimensionRightBoundaryByIndex: jest.fn((index: number) => (index + 1) * 100),
    getLeftBoundaryColIndexByDimension: jest.fn((value: number) => Math.floor(value / 100)),
    getRightBoundaryColIndexByDimension: jest.fn((value: number) => Math.floor(value / 100)),
    getDefaultValue: jest.fn(() => 100),
  });
  return {
    readDataViewField: (viewKey: string, fieldKey: string) => {
      if (viewKey !== SheetDataFieldNamespace) return null;
      if (fieldKey === SheetDataMatrixFieldKey) return sheetData;
      if (fieldKey === SheetRowSizesFieldKey) return rowSizeFields;
      if (fieldKey === SheetColumnSizesFieldKey) return columnSizeFields;
      if (fieldKey === SheetHorizontalAlignmentFieldKey) return cellAlignments;
      if (fieldKey === SheetRowHiddenOriginalSizesFieldKey) return rowHiddenOriginalSizes;
      if (fieldKey === SheetColumnHiddenOriginalSizesFieldKey) return columnHiddenOriginalSizes;
      return null;
    },
  };
}

function createPlugin(
  measureLines = jest.fn(() => ({ width: 10, height: 8 })),
  commands: SheetCommandBus | null = createResizeTestCommandBus(),
  platform?: { warn: jest.Mock },
  cursorRegistry?: CursorRegistry,
  pointerCapture: PointerCapture = new HeadlessPointerCapture(),
): SheetResizePlugin {
  const coordinates = {
    screenToWorld: jest.fn((x: number, y: number) => ({
      x: x + 10,
      y: y + 20,
    })),
    screenToView: jest.fn((x: number, y: number) => ({ x, y })),
    getCurrentMouseWorld: jest.fn(() => ({ x: 30, y: 40 })),
    getCurrentMouseView: jest.fn(() => ({ x: 3, y: 4 })),
  };
  const cursor = { apply: jest.fn(), override: jest.fn() };
  const textShaper = {
    shape: jest.fn(() => {
      const measured = measureLines();
      return { width: measured.width, height: measured.height };
    }),
  };
  const displayText = { getDisplayText: jest.fn(() => 'cell') };

  const plugin = new SheetResizePlugin(
    coordinates as never,
    cursor as never,
    textShaper as never,
    displayText,
    pointerCapture,
    commands ?? void 0,
    platform as never,
    cursorRegistry,
  );
  if (commands) plugin.registerCommands(commands);
  return plugin;
}

function setUnassembledDragState(plugin: Pick<ResizePluginInternals, 'beginResizeDrag' | 'updateResizeDrag'>, state: {
  dragTarget: { type: 'row' | 'col'; primaryIndex: number; initialSizes: Map<number, number> };
  dragStartWorld: { x: number; y: number };
  currentWorld: { x: number; y: number };
}): void {
  plugin.beginResizeDrag({
    axis: state.dragTarget.type,
    primaryIndex: state.dragTarget.primaryIndex,
    initialSizes: [...state.dragTarget.initialSizes].map(([index, size]) => ({ index, size })),
    world: state.dragStartWorld,
  });
  plugin.updateResizeDrag({ world: state.currentWorld });
}

function createCore(): {
  appliedTransactions: Transaction[];
  executePipeline: jest.Mock;
  requestRender: jest.Mock;
  getDataEngine: () => ReturnType<typeof createResizeDataEngine>;
  pluginManager: { getPluginState: jest.Mock };
} {
  const appliedTransactions: Transaction[] = [];
  const core = {
    appliedTransactions,
    executePipeline: createPipelineExecutor(appliedTransactions),
    requestRender: jest.fn(),
    pluginManager: { getPluginState: jest.fn(() => null) },
    getDataEngine: () =>
      createResizeDataEngine({
        rowHiddenOriginalSizes: createHiddenOriginalSizeMatrix([
          [0, 0],
          [2, 12],
        ]),
        columnHiddenOriginalSizes: createHiddenOriginalSizeMatrix([[4, 15]]),
      }),
  };
  currentCore = core;
  return core;
}

function createResizeTestCommandBus(): SheetCommandBus {
  const commands = new SheetCommandBus();
  commands.bind({
    executePipeline: (pipeline) => {
      const core = currentCore;
      if (core) return core.executePipeline(pipeline);
      return createPipelineExecutor()(pipeline);
    },
    applyEffect: () => void 0,
  });
  return commands;
}

function createResizeDimensionDataSource(): SheetResizeDimensionCommandDataSource {
  const rowSizes = new Map<number, number>([
    [0, 24],
    [1, 30],
    [2, 0],
  ]);
  const columnSizes = new Map<number, number>([
    [0, 80],
    [1, 90],
    [2, 0],
  ]);
  return {
    target: SheetResizePlugin.pluginKey,
    getRowCount: () => 3,
    getColumnCount: () => 3,
    getDefaultRowSize: () => 24,
    getDefaultColumnSize: () => 80,
    readRowSize: (index) => rowSizes.get(index) ?? 24,
    readColumnSize: (index) => columnSizes.get(index) ?? 80,
    readRowHiddenOriginalSize: (index) => (index === 2 ? 34 : null),
    readColumnHiddenOriginalSize: (index) => (index === 2 ? 104 : null),
  };
}

function createPipelineExecutor(appliedTransactions: Transaction[] = []): jest.Mock {
  return jest.fn((pipeline: Pipeline) => {
    pipeline.steps.forEach((step) => {
      if (step.transaction) appliedTransactions.push(step.transaction);
      step.localAction?.();
    });
  });
}

type ResizeOperationRecord = Record<string, { value: number; prev: number }>;

function readResizeOperation(transaction: Transaction, index = 0): ResizeOperationRecord {
  return transaction.operations[index] as unknown as ResizeOperationRecord;
}

describe('SheetResizePlugin', () => {
  beforeEach(() => {
    container = new Container();
  });

  afterEach(() => {
    currentCore = null;
    container.reset();
  });

  it('exposes a stable empty plugin state contract', () => {
    const plugin = createPlugin();
    const transaction = createTransaction(SheetResizePlugin.pluginKey);

    expect(plugin.apply(plugin.getState(), transaction)).toBeNull();
    expect(plugin.getPluginConfig()).toEqual({});
    const [resizeRegistration] = plugin.registerState();
    if (!resizeRegistration) throw new Error('Missing resize registration.');
    expect(resizeRegistration.state).toEqual({ dimensions: null });
    expect(plugin.getResizeState()).toEqual({
      isDragging: false,
      dragTarget: null,
      dragStartWorld: null,
      currentWorld: null,
    });
    expect(resizeRegistration.dataEngine.dataView.map((field) => field.select(resizeRegistration.state))).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('keeps drag-session writes command-backed and snapshots detached', () => {
    const commands = createResizeTestCommandBus();
    const plugin = createPlugin(void 0, commands);
    const begin = {
      axis: 'row' as const,
      primaryIndex: 0,
      initialSizes: [{ index: 0, size: 24 }],
      world: { x: 0, y: 0 },
    };
    Object.assign(plugin, { assertDragCommand: () => void 0 });

    expect(() => plugin.beginResizeDrag(begin)).toThrow('through a command');
    commands.run(BeginSheetResizeDragCommand, begin);
    const snapshot = plugin.getResizeState();
    snapshot.dragTarget!.initialSizes.set(0, 99);
    expect(plugin.getResizeState().dragTarget!.initialSizes.get(0)).toBe(24);
    expect(() => plugin.updateResizeDrag({ world: { x: 2, y: 3 } })).toThrow('through a command');
    commands.run(EndSheetResizeDragCommand, void 0);
    expect(plugin.getResizeState().isDragging).toBe(false);
  });

  it('publishes dimensions from the single transaction-owned resize state', () => {
    const plugin = createPlugin();
    const rowSizes = new RowShapeDimensionsCSRMatrix(void 0, [1, 3]);
    const columnSizes = new ColumnShapeDimensionsCSRMatrix(void 0, [1, 3]);
    const rowHiddenOriginalSizes = new CSRMatrix<number>(void 0, [1, 3]);
    const columnHiddenOriginalSizes = new CSRMatrix<number>(void 0, [1, 3]);
    plugin.setResizeDimensions({ rowSizes, columnSizes, rowHiddenOriginalSizes, columnHiddenOriginalSizes });

    const [registration] = plugin.registerState();
    if (!registration) throw new Error('Missing resize registration.');
    expect(registration.key).toBe(SheetResizePlugin.pluginKey);
    expect(plugin.transactionOT).toMatchObject({ ownerId: 'sheet.resize', collaborative: true });
    expect(registration.dataEngine.dataView.map((field) => field.select(registration.state))).toEqual([
      rowSizes,
      columnSizes,
      rowHiddenOriginalSizes,
      columnHiddenOriginalSizes,
    ]);
  });

  it('applies and rolls back dimension matrices through SheetResizePlugin', () => {
    const plugin = createPlugin();
    const rowSizes = new RowShapeDimensionsCSRMatrix(void 0, [1, 3]);
    const columnSizes = new ColumnShapeDimensionsCSRMatrix(void 0, [1, 3]);
    rowSizes.setDefaultValue(24);
    columnSizes.setDefaultValue(100);
    plugin.setResizeDimensions({
      rowSizes,
      columnSizes,
      rowHiddenOriginalSizes: new CSRMatrix<number>(void 0, [1, 3]),
      columnHiddenOriginalSizes: new CSRMatrix<number>(void 0, [1, 3]),
    });

    const transaction = createTransaction(SheetResizePlugin.pluginKey);
    transaction.addOperation([
      { p: [1], [MatrixOTActionName.ResizeRow]: { value: 40, prev: 24 } },
      { p: [2], [MatrixOTActionName.ResizeCol]: { value: 140, prev: 100 } },
    ]);
    plugin.apply(plugin.getState(), transaction);
    expect(rowSizes.getItem(0, 1)).toBe(40);
    expect(columnSizes.getItem(0, 2)).toBe(140);
  });

  it('stores hidden original sizes in SheetResizePlugin dimension state', () => {
    const plugin = createPlugin();
    const rowSizes = new RowShapeDimensionsCSRMatrix(void 0, [1, 3]);
    const columnSizes = new ColumnShapeDimensionsCSRMatrix(void 0, [1, 3]);
    rowSizes.setDefaultValue(24);
    columnSizes.setDefaultValue(100);
    const rowHiddenOriginalSizes = new CSRMatrix<number>(void 0, [1, 3]);
    const columnHiddenOriginalSizes = new CSRMatrix<number>(void 0, [1, 3]);
    plugin.setResizeDimensions({ rowSizes, columnSizes, rowHiddenOriginalSizes, columnHiddenOriginalSizes });

    const hide = createTransaction(SheetResizePlugin.pluginKey);
    hide.addOperation([
      { p: [1], [MatrixOTActionName.ResizeRow]: { value: 0, prev: 24 } },
      { p: [1], [MatrixOTActionName.ResizeCol]: { value: 0, prev: 100 } },
    ]);

    plugin.apply(plugin.getState(), hide);
    expect(rowHiddenOriginalSizes.getItem(0, 1)).toBe(24);
    expect(columnHiddenOriginalSizes.getItem(0, 1)).toBe(100);
  });

  it('applies resize structure operations and hidden-size clear operations', () => {
    const plugin = createPlugin();
    const rowSizes = new RowShapeDimensionsCSRMatrix(void 0, [1, 3]);
    const columnSizes = new ColumnShapeDimensionsCSRMatrix(void 0, [1, 3]);
    rowSizes.setDefaultValue(24);
    columnSizes.setDefaultValue(100);
    const rowHiddenOriginalSizes = new CSRMatrix<number>(void 0, [1, 3]);
    const columnHiddenOriginalSizes = new CSRMatrix<number>(void 0, [1, 3]);
    rowHiddenOriginalSizes.addItem(0, 1, 24);
    columnHiddenOriginalSizes.addItem(0, 1, 100);
    plugin.setResizeDimensions({ rowSizes, columnSizes, rowHiddenOriginalSizes, columnHiddenOriginalSizes });

    const transaction = createTransaction(SheetResizePlugin.pluginKey);
    transaction.addOperation([
      { p: [0], [MatrixOTActionName.RowInsert]: [null, null, null] },
      { p: [1], [MatrixOTActionName.RowDelete]: [null, null, null] },
      { p: [0, 1], [MatrixOTActionName.RowMove]: [1, 0] },
      { p: [0], [MatrixOTActionName.ColInsert]: [null, null, null] },
      { p: [1], [MatrixOTActionName.ColDelete]: [null, null, null] },
      { p: [0, 1], [MatrixOTActionName.ColMove]: [1, 0] },
      {
        p: [1],
        [MatrixOTActionName.ResizeRow]: { value: 0 },
      } as unknown as Operation,
      {
        p: [1],
        [MatrixOTActionName.ResizeCol]: { value: 0 },
      } as unknown as Operation,
      { p: [1], [MatrixOTActionName.ResizeRow]: { value: 30, prev: 0 } },
      { p: [1], [MatrixOTActionName.ResizeCol]: { value: 120, prev: 0 } },
      { p: [9] } as unknown as Operation,
    ]);
    expect(plugin.apply(plugin.getState(), transaction)).toBe(plugin.getState());
  });

  it('skips apply when dimensions disappear after operation collection', () => {
    const plugin = createPlugin();
    const rowSizes = new RowShapeDimensionsCSRMatrix(void 0, [1, 2]);
    const columnSizes = new ColumnShapeDimensionsCSRMatrix(void 0, [1, 2]);
    rowSizes.setDefaultValue(24);
    columnSizes.setDefaultValue(100);
    const dimensions = {
      rowSizes,
      columnSizes,
      rowHiddenOriginalSizes: new CSRMatrix<number>(void 0, [1, 2]),
      columnHiddenOriginalSizes: new CSRMatrix<number>(void 0, [1, 2]),
    };
    const transaction = createTransaction(SheetResizePlugin.pluginKey);
    transaction.addOperation([{ p: [1], [MatrixOTActionName.ResizeRow]: { value: 36, prev: 24 } }]);
    let reads = 0;
    const disappearingState = {
      get dimensions() {
        reads += 1;
        return reads === 1 ? dimensions : null;
      },
    };

    expect(plugin.apply(disappearingState as never, transaction)).toBeNull();
    expect(rowSizes.getItem(0, 1)).toBe(24);
  });

  it('applies row-only and column-only resize operations independently', () => {
    const plugin = createPlugin();
    const rowSizes = new RowShapeDimensionsCSRMatrix(void 0, [1, 2]);
    const columnSizes = new ColumnShapeDimensionsCSRMatrix(void 0, [1, 2]);
    rowSizes.setDefaultValue(24);
    columnSizes.setDefaultValue(100);
    plugin.setResizeDimensions({
      rowSizes,
      columnSizes,
      rowHiddenOriginalSizes: new CSRMatrix<number>(void 0, [1, 2]),
      columnHiddenOriginalSizes: new CSRMatrix<number>(void 0, [1, 2]),
    });

    const rowTransaction = createTransaction(SheetResizePlugin.pluginKey);
    rowTransaction.addOperation([{ p: [1], [MatrixOTActionName.ResizeRow]: { value: 36, prev: 24 } }]);
    plugin.apply(plugin.getState(), rowTransaction);
    expect(rowSizes.getItem(0, 1)).toBe(36);

    const columnTransaction = createTransaction(SheetResizePlugin.pluginKey);
    columnTransaction.addOperation([{ p: [1], [MatrixOTActionName.ResizeCol]: { value: 140, prev: 100 } }]);
    plugin.apply(plugin.getState(), columnTransaction);
    expect(columnSizes.getItem(0, 1)).toBe(140);
  });

  it('skips unknown dimension operations', () => {
    const plugin = createPlugin();
    const rowSizes = new RowShapeDimensionsCSRMatrix(void 0, [1, 2]);
    const columnSizes = new ColumnShapeDimensionsCSRMatrix(void 0, [1, 2]);
    rowSizes.setDefaultValue(24);
    columnSizes.setDefaultValue(100);
    plugin.setResizeDimensions({
      rowSizes,
      columnSizes,
      rowHiddenOriginalSizes: new CSRMatrix<number>(void 0, [1, 2]),
      columnHiddenOriginalSizes: new CSRMatrix<number>(void 0, [1, 2]),
    });
    const transaction = createTransaction(SheetResizePlugin.pluginKey);
    transaction.addOperation([{ p: [9] } as unknown as Operation]);

    expect(plugin.apply(plugin.getState(), transaction)).toBeNull();
  });

  it('marks the viewport dirty only for row or column resize transactions', () => {
    const plugin = createPlugin();
    const resize = createTransaction(SheetResizePlugin.pluginKey);
    resize.addOperation([{ p: [1], [MatrixOTActionName.ResizeRow]: { value: 36, prev: 24 } }]);
    const nonResize = createTransaction(SheetResizePlugin.pluginKey);
    nonResize.addOperation([{ p: [1], [MatrixOTActionName.RowInsert]: [null] }]);
    const core = {
      renderEngine: {
        scrollManager: {
          getShape: jest.fn(() => [320, 180]),
          getState: jest.fn(() => ({ x: 7, y: 9 })),
        },
      },
    };

    expect(plugin.dirtyRect(core as never, nonResize)).toBeNull();
    expect(plugin.dirtyRect(core as never, resize)).toEqual(
      expect.objectContaining({ x: 7, y: 9, width: 320, height: 180 }),
    );

    const resizeColumn = createTransaction(SheetResizePlugin.pluginKey);
    resizeColumn.addOperation([{ p: [1], [MatrixOTActionName.ResizeCol]: { value: 120, prev: 100 } }]);
    expect(plugin.dirtyRect(core as never, resizeColumn)).toEqual(
      expect.objectContaining({ x: 7, y: 9, width: 320, height: 180 }),
    );
  });

  it('reads resize fields from registered data view fields', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals;
    const sheetData = { shape: [2, 2] as [number, number], getItem: jest.fn(() => null) };
    const rowSizes = {
      shape: [1, 2] as [number, number],
      getItem: jest.fn(() => 24),
      getDimensionLeftBoundaryByIndex: jest.fn(() => 0),
      getDimensionRightBoundaryByIndex: jest.fn(() => 24),
      getLeftBoundaryColIndexByDimension: jest.fn(() => 0),
      getRightBoundaryColIndexByDimension: jest.fn(() => 0),
    };
    const columnSizes = {
      shape: [1, 2] as [number, number],
      getItem: jest.fn(() => 100),
      getDimensionLeftBoundaryByIndex: jest.fn(() => 0),
      getDimensionRightBoundaryByIndex: jest.fn(() => 100),
      getLeftBoundaryColIndexByDimension: jest.fn(() => 0),
      getRightBoundaryColIndexByDimension: jest.fn(() => 0),
    };
    const hidden = createHiddenOriginalSizeMatrix();
    const dataViewCore = {
      getDataEngine: () =>
        createResizeDataEngine({
          sheetData,
          rowSizes,
          columnSizes,
          rowHiddenOriginalSizes: hidden,
          columnHiddenOriginalSizes: hidden,
        }),
    };

    const dataViewFields = plugin.readResizeSheetFields(dataViewCore);
    expect(dataViewFields?.cellAlignments.getItem(0, 0)).toBeNull();
  });

  it('returns null when required registered resize fields are unavailable', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals;
    const partialDataViewCore = {
      getDataEngine: () => ({
        readDataViewField: (_viewKey: string, fieldKey: string) =>
          fieldKey === SheetDataMatrixFieldKey ? { shape: [1, 1], getItem: jest.fn() } : null,
      }),
    };

    expect(plugin.readResizeSheetFields(partialDataViewCore)).toBeNull();
    expect(plugin.readResizeSheetFields({})).toBeNull();
  });

  it('reads resize fields from a direct dataEngine property when no getter is exposed', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals;
    const sheetData = { shape: [1, 1] as [number, number], getItem: jest.fn(() => null) };
    const rowSizes = new RowShapeDimensionsCSRMatrix(void 0, [1, 1]);
    const columnSizes = new ColumnShapeDimensionsCSRMatrix(void 0, [1, 1]);
    const rowHiddenOriginalSizes = new CSRMatrix<number>(void 0, [1, 1]);
    const columnHiddenOriginalSizes = new CSRMatrix<number>(void 0, [1, 1]);
    const cellAlignments = { getItem: jest.fn(() => 'right') };
    const core = {
      dataEngine: {
        readDataViewField: (viewKey: string, fieldKey: string) => {
          if (viewKey !== SheetDataFieldNamespace) return null;
          if (fieldKey === SheetDataMatrixFieldKey) return sheetData;
          if (fieldKey === SheetRowSizesFieldKey) return rowSizes;
          if (fieldKey === SheetColumnSizesFieldKey) return columnSizes;
          if (fieldKey === SheetHorizontalAlignmentFieldKey) return cellAlignments;
          if (fieldKey === SheetRowHiddenOriginalSizesFieldKey) return rowHiddenOriginalSizes;
          if (fieldKey === SheetColumnHiddenOriginalSizesFieldKey) return columnHiddenOriginalSizes;
          return null;
        },
      },
    };

    expect(plugin.readResizeSheetFields(core)?.cellAlignments.getItem(0, 0)).toBe('right');
  });

  it('registers resize drag commands on the standard command bus', () => {
    const commands = new SheetCommandBus();
    commands.bind({ executePipeline: createPipelineExecutor(), applyEffect: () => void 0 });
    const controller = {
      beginResizeDrag: jest.fn(),
      updateResizeDrag: jest.fn(),
      endResizeDrag: jest.fn(),
    };

    registerSheetResizeDragCommands(commands, controller);
    commands.run(BeginSheetResizeDragCommand, {
      axis: 'row',
      primaryIndex: 1,
      initialSizes: [{ index: 1, size: 24 }],
      world: { x: 10, y: 20 },
    });
    commands.run(UpdateSheetResizeDragCommand, { world: { x: 10, y: 30 } });
    commands.run(EndSheetResizeDragCommand, void 0);

    expect(commands.has(BeginSheetResizeDragCommand)).toBe(true);
    expect(controller.beginResizeDrag).toHaveBeenCalledTimes(1);
    expect(controller.updateResizeDrag).toHaveBeenCalledTimes(1);
    expect(controller.endResizeDrag).toHaveBeenCalledTimes(1);
  });

  it('exposes stable row and column dimension command definitions', () => {
    expect(
      [
        ResizeSheetRowsCommand,
        ResizeSheetColumnsCommand,
        HideSheetRowsCommand,
        HideSheetColumnsCommand,
        UnhideSheetRowsCommand,
        UnhideSheetColumnsCommand,
      ].map(({ id }) => id),
    ).toEqual([
      'sheet.resizeRows',
      'sheet.resizeColumns',
      'sheet.hideRows',
      'sheet.hideColumns',
      'sheet.unhideRows',
      'sheet.unhideColumns',
    ]);
  });

  it('creates resize and hide operations with previous dimension payloads', () => {
    const dataSource = createResizeDimensionDataSource();

    expect(createResizeRowOperations({ index: 0, count: 2, size: 36 }, dataSource)).toEqual([
      { p: [0], [MatrixOTActionName.ResizeRow]: { value: 36, prev: 24 } },
      { p: [1], [MatrixOTActionName.ResizeRow]: { value: 36, prev: 30 } },
    ]);
    expect(createResizeColumnOperations({ index: 1, size: 120 }, dataSource)).toEqual([
      { p: [1], [MatrixOTActionName.ResizeCol]: { value: 120, prev: 90 } },
    ]);
    expect(createResizeColumnOperations({ sizes: [{ index: 0, size: 96 }] }, dataSource)).toEqual([
      { p: [0], [MatrixOTActionName.ResizeCol]: { value: 96, prev: 80 } },
    ]);
    expect(createHideRowOperations({ index: 1, count: 2 }, dataSource)).toEqual([
      { p: [1], [MatrixOTActionName.ResizeRow]: { value: 0, prev: 30 } },
      { p: [2], [MatrixOTActionName.ResizeRow]: { value: 0, prev: 0 } },
    ]);
    expect(createHideColumnOperations({ index: 0, count: 2 }, dataSource)).toEqual([
      { p: [0], [MatrixOTActionName.ResizeCol]: { value: 0, prev: 80 } },
      { p: [1], [MatrixOTActionName.ResizeCol]: { value: 0, prev: 90 } },
    ]);
  });

  it('creates unhide operations only for hidden dimensions', () => {
    const dataSource = createResizeDimensionDataSource();

    expect(createUnhideRowOperations({ index: 0, count: 3 }, dataSource)).toEqual([
      { p: [2], [MatrixOTActionName.ResizeRow]: { value: 34, prev: 0 } },
    ]);
    expect(createUnhideColumnOperations({ index: 0, count: 3 }, dataSource)).toEqual([
      { p: [2], [MatrixOTActionName.ResizeCol]: { value: 104, prev: 0 } },
    ]);
  });

  it('validates row and column dimension command input', () => {
    const dataSource = createResizeDimensionDataSource();

    expect(() => createResizeRowOperations({ index: -1, size: 20 }, dataSource)).toThrow(
      'row resize index must be a non-negative integer.',
    );
    expect(() => createResizeColumnOperations({ index: 0, count: 0, size: 20 }, dataSource)).toThrow(
      'sheet resize command count must be a positive integer.',
    );
    expect(() => createResizeRowOperations({ index: 0, size: -1 }, dataSource)).toThrow(
      'row size must be a non-negative finite number.',
    );
    expect(() => createHideColumnOperations({ index: 2, count: 2 }, dataSource)).toThrow(
      'column hide range exceeds current sheet bounds.',
    );
  });

  it('registers semantic resize dimension commands on the command bus', () => {
    const appliedTransactions: Transaction[] = [];
    const commands = new SheetCommandBus();
    commands.bind({ executePipeline: createPipelineExecutor(appliedTransactions), applyEffect: () => void 0 });

    registerSheetResizeDimensionCommands(commands, createResizeDimensionDataSource());
    commands.run(ResizeSheetRowsCommand, { index: 1, size: 44 });

    expect(commands.has(ResizeSheetRowsCommand)).toBe(true);
    expect(commands.has(UnhideSheetColumnsCommand)).toBe(true);
    expect(appliedTransactions[0]).toMatchObject({
      pluginKey: SheetResizePlugin.pluginKey,
      operations: [{ p: [1], [MatrixOTActionName.ResizeRow]: { value: 44, prev: 30 } }],
    });
  });

  it('registers resize commands through the plugin lifecycle hook', () => {
    const commands = new SheetCommandBus();
    const plugin = createPlugin(void 0, null);

    plugin.registerCommands(commands);
    expect(commands.has(BeginSheetResizeDragCommand)).toBe(true);
    expect(commands.has(ResizeSheetRowsCommand)).toBe(true);
    expect(commands.has(UnhideSheetColumnsCommand)).toBe(true);
  });

  it('keeps the initial command bus when a later lifecycle call tries to replace it', () => {
    const injectedCommands = createResizeTestCommandBus();
    const registeredCommands = createResizeTestCommandBus();
    const plugin = createPlugin(void 0, injectedCommands);

    expect(() => plugin.registerCommands(registeredCommands)).toThrow('already bound');
    Object.assign(plugin, { registeredCommandBus: registeredCommands, commandCore: {} });
    const internals = plugin as unknown as {
      runCommand(core: object, definition: typeof EndSheetResizeDragCommand, input: void): void;
    };
    expect(() => internals.runCommand({ requestRender: jest.fn() }, EndSheetResizeDragCommand, void 0)).not.toThrow();

    expect(registeredCommands.has(EndSheetResizeDragCommand)).toBe(false);
    expect(injectedCommands.has(EndSheetResizeDragCommand)).toBe(true);
  });

  it('maps pointer coordinates from events and current coordinate state', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals;

    expect(plugin.getResizePointer({ origin: { offsetX: 1, offsetY: 2 } })).toEqual({
      world: { x: 11, y: 22 },
      view: { x: 1, y: 2 },
    });
    expect(plugin.getResizePointer()).toEqual({
      world: { x: 30, y: 40 },
      view: { x: 3, y: 4 },
    });

    expect(
      plugin.getResizePointer({
        origin: { offsetX: 7, offsetY: 9 },
        target: { properties: { region: 'columnHeader' } },
      } as never),
    ).toEqual({
      world: { x: 17, y: 29 },
      view: { x: 7, y: 9 },
      region: 'columnHeader',
    });
  });

  it('finds row and column resize handles using view coordinates for sticky header membership', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals;
    const rowSizes = {
      getRightBoundaryColIndexByDimension: jest.fn((value: number) => Math.floor(value / 20)),
      getDimensionRightBoundaryByIndex: jest.fn((index: number) => (index + 1) * 20),
      getItem: jest.fn(() => 20),
    };
    const columnSizes = {
      getRightBoundaryColIndexByDimension: jest.fn((value: number) => Math.floor(value / 30)),
      getDimensionRightBoundaryByIndex: jest.fn((index: number) => (index + 1) * 30),
      getItem: jest.fn(() => 30),
    };
    const core = {
      getDataEngine: () => createResizeDataEngine({ rowSizes, columnSizes }),
    };

    expect(
      plugin.detectResizeHandle(core, {
        world: { x: 430, y: 164 },
        view: { x: 10, y: 60 },
      }),
    ).toEqual(expect.objectContaining({ type: 'row', primaryIndex: 6 }));
    expect(
      plugin.detectResizeHandle(core, {
        world: { x: 170, y: 460 },
        view: { x: 90, y: 10 },
      }),
    ).toEqual(expect.objectContaining({ type: 'col', primaryIndex: 3 }));

    const rowCurrentBoundary = plugin.detectResizeHandle(core, {
      world: { x: 0, y: 104 },
      view: { x: 10, y: 40 },
    });
    expect(rowCurrentBoundary).toEqual(expect.objectContaining({ type: 'row', primaryIndex: 3 }));

    const colCurrentBoundary = plugin.detectResizeHandle(core, {
      world: { x: 170, y: 10 },
      view: { x: 90, y: 10 },
    });
    expect(colCurrentBoundary).toEqual(expect.objectContaining({ type: 'col', primaryIndex: 3 }));
  });

  it('does not expose resize handles when sheet dimensions are unavailable', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals;
    const core = { getDataEngine: () => ({ readDataViewField: () => null }) };

    expect(plugin.detectResizeHandle(core, { world: { x: 0, y: 0 }, view: { x: 0, y: 0 } })).toBeNull();
  });

  it('leaves normal cursor presentation to the registered position rules', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals & {
      onMouseMove(core: object, event: object): boolean | void;
      detectHiddenMarkerClick: jest.Mock;
      detectResizeHandle: jest.Mock;
      cursorEngine: { apply: jest.Mock };
    };
    plugin.detectHiddenMarkerClick = jest.fn(() => null) as never;
    plugin.detectResizeHandle = jest.fn(() => ({ type: 'row' })) as never;

    const core = {
      requestRender: jest.fn(),
      pluginManager: { getPluginState: jest.fn() },
    };

    plugin.onMouseMove(core, { origin: { offsetX: 10, offsetY: 10 } });

    expect(plugin.cursorEngine.apply).not.toHaveBeenCalled();
  });

  it('registers coordinate rules for hidden markers and row/column resize boundaries', () => {
    const registry = new CursorRegistry();
    const plugin = createPlugin(
      jest.fn(() => ({ width: 10, height: 8 })),
      createResizeTestCommandBus(),
      void 0,
      registry,
    ) as unknown as {
      detectHiddenMarkerClick: jest.Mock;
      detectResizeHandle: jest.Mock;
    };
    const position = {
      core: {} as never,
      origin: { offsetX: 10, offsetY: 20 } as MouseEvent,
      view: { x: 10, y: 20 },
      world: { x: 110, y: 120 },
      target: null,
    };

    plugin.detectHiddenMarkerClick = jest.fn(() => ({ type: 'row', index: 0 })) as never;
    plugin.detectResizeHandle = jest.fn(() => ({ type: 'row' })) as never;
    expect(registry.resolve(null, position)).toBe(CursorToken.Pointer);

    plugin.detectHiddenMarkerClick = jest.fn(() => null) as never;
    plugin.detectResizeHandle = jest.fn(() => ({ type: 'row' })) as never;
    expect(registry.resolve(null, position)).toBe(CursorToken.RowResize);

    plugin.detectResizeHandle = jest.fn(() => ({ type: 'col' })) as never;
    expect(registry.resolve(null, position)).toBe(CursorToken.ColumnResize);

    plugin.detectResizeHandle = jest.fn(() => null) as never;
    expect(registry.resolve(null, { ...position, target: { type: 'cell', region: 'grid' } as never })).toBe(
      CursorToken.Default,
    );
  });

  it('keeps cursor unchanged when mouse move finds neither marker nor handle', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals & {
      onMouseMove(core: object, event: object): boolean | void;
      detectHiddenMarkerClick: jest.Mock;
      detectResizeHandle: jest.Mock;
      cursorEngine: { apply: jest.Mock };
    };
    plugin.detectHiddenMarkerClick = jest.fn(() => null) as never;
    plugin.detectResizeHandle = jest.fn(() => null) as never;

    const core = {
      requestRender: jest.fn(),
      pluginManager: { getPluginState: jest.fn() },
    };

    expect(plugin.onMouseMove(core, { origin: { offsetX: 10, offsetY: 10 } })).toBe(void 0);
    expect(plugin.cursorEngine.apply).not.toHaveBeenCalled();
  });

  it('shows a pointer for a hidden row marker and restores the saved size when it is clicked', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals & {
      onMouseMove(core: object, event: object): boolean | void;
      onMouseDown(core: object, event: object): boolean | void;
    };
    const appliedTransactions: Transaction[] = [];
    const dataState = {
      rowSizes: { getDimensionRightBoundaryByIndex: () => 20 },
      columnSizes: { getDimensionRightBoundaryByIndex: () => 30 },
      rowHiddenOriginalSizes: createHiddenOriginalSizeMatrix([[0, 20]]),
      columnHiddenOriginalSizes: createHiddenOriginalSizeMatrix(),
    };
    const core = {
      appliedTransactions,
      executePipeline: createPipelineExecutor(appliedTransactions),
      requestRender: jest.fn(),
      getDataEngine: () => createResizeDataEngine(dataState),
    };
    currentCore = core;
    plugin.dispatchResize(
      core,
      { type: 'row', primaryIndex: 0, initialSizes: new Map([[0, 20]]) },
      { x: 0, y: 44 },
      { x: 0, y: 24 },
    );
    const event = { origin: { offsetX: 1, offsetY: 24 } };

    expect(plugin.onMouseMove(core, event)).toBe(void 0);
    expect((plugin as unknown as { cursorEngine: { apply: jest.Mock } }).cursorEngine.apply).not.toHaveBeenCalled();
    expect(plugin.onMouseDown(core, event)).toBe(false);
    expect(appliedTransactions).toHaveLength(2);
  });

  it('tracks a selected row resize drag and commits it when the pointer is released', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals & {
      onMouseDown(core: object, event: object): boolean | void;
      onMouseMove(core: object, event: object): boolean | void;
      onMouseUp(core: object, event: object): void;
      detectResizeHandle: jest.Mock;
      getSelectedIndices: jest.Mock;
      cursorEngine: { override: jest.Mock };
      getState(): {
        isDragging: boolean;
        dragTarget: { initialSizes: Map<number, number> } | null;
        currentWorld: { x: number; y: number } | null;
      };
    };
    plugin.detectResizeHandle = jest.fn(() => ({
      type: 'row',
      primaryIndex: 0,
      initialSizes: new Map([[0, 10]]),
    })) as never;
    plugin.getSelectedIndices = jest.fn(() => [0, 1]);
    const appliedTransactions: Transaction[] = [];
    const requestRender = jest.fn();
    const markDirty = jest.fn();
    const dataState = {
      rowSizes: { getItem: jest.fn(() => 10) },
      columnSizes: { getItem: jest.fn(() => 20) },
    };
    const core = {
      appliedTransactions,
      executePipeline: createPipelineExecutor(appliedTransactions),
      requestRender,
      getDataEngine: () => createResizeDataEngine(dataState),
      renderEngine: {
        markDirty,
        scrollManager: { getShape: () => [200, 100] as [number, number], getState: () => ({ x: 5, y: 7 }) },
      },
    };
    currentCore = core;

    expect(plugin.onMouseDown(core, { origin: { offsetX: 1, offsetY: 2 } })).toBe(false);
    expect(plugin.getResizeState().isDragging).toBe(true);
    expect(plugin.getResizeState().dragTarget?.initialSizes).toEqual(
      new Map([
        [0, 10],
        [1, 10],
      ]),
    );
    expect(plugin.cursorEngine.override).toHaveBeenCalledWith('row-resize');

    expect(plugin.onMouseMove(core, { origin: { offsetX: 3, offsetY: 8 } })).toBe(false);
    expect(plugin.getResizeState().currentWorld).toEqual({ x: 13, y: 28 });
    expect(requestRender).toHaveBeenCalledWith(plugin);

    plugin.onMouseUp(core, { origin: { offsetX: 4, offsetY: 10 } });

    expect(appliedTransactions).toHaveLength(1);
    expect(plugin.cursorEngine.override).toHaveBeenLastCalledWith(null);
    expect(markDirty).not.toHaveBeenCalled();
    expect(plugin.dirtyRect(core as never, appliedTransactions[0])).toEqual(
      expect.objectContaining({ x: 5, y: 7, width: 200, height: 100 }),
    );
    expect(plugin.getResizeState().isDragging).toBe(false);
  });

  it('starts dragging a single row when no selection range applies', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals & {
      onMouseDown(core: object, event: object): boolean | void;
      detectHiddenMarkerClick: jest.Mock;
      detectResizeHandle: jest.Mock;
      getSelectedIndices: jest.Mock;
      getState(): {
        dragTarget: { primaryIndex: number; initialSizes: Map<number, number> } | null;
      };
    };
    plugin.detectHiddenMarkerClick = jest.fn(() => null) as never;
    plugin.detectResizeHandle = jest.fn(() => ({
      type: 'row',
      primaryIndex: 3,
      initialSizes: new Map([[3, 12]]),
    })) as never;
    plugin.getSelectedIndices = jest.fn(() => null);

    const appliedTransactions: Transaction[] = [];
    const core = {
      appliedTransactions,
      executePipeline: createPipelineExecutor(appliedTransactions),
      requestRender: jest.fn(),
      pluginManager: { getPluginState: jest.fn(() => void 0) },
    };

    expect(plugin.onMouseDown(core, { origin: { offsetX: 2, offsetY: 3 } })).toBe(false);
    expect(plugin.getResizeState().dragTarget?.primaryIndex).toBe(3);
    expect(plugin.getResizeState().dragTarget?.initialSizes).toEqual(new Map([[3, 0]]));
  });

  it('returns without entering drag when mousedown detects no resize handle', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals & {
      detectHiddenMarkerClick: jest.Mock;
      detectResizeHandle: jest.Mock;
      onMouseDown(core: object, event: object): boolean | void;
      getResizeState(): { isDragging: boolean; dragTarget: unknown };
    };
    plugin.detectHiddenMarkerClick = jest.fn(() => null) as never;
    plugin.detectResizeHandle = jest.fn(() => null) as never;

    const appliedTransactions: Transaction[] = [];
    const core = {
      appliedTransactions,
      executePipeline: createPipelineExecutor(appliedTransactions),
      requestRender: jest.fn(),
      pluginManager: { getPluginState: jest.fn(() => void 0) },
    };

    expect(plugin.onMouseDown(core, { origin: { offsetX: 1, offsetY: 1 } })).toBe(void 0);
    expect(plugin.getResizeState().isDragging).toBe(false);
    expect(plugin.getResizeState().dragTarget).toBeNull();
  });

  it('reads persisted sizes on both selected-row and single-column drag branches', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals & {
      detectHiddenMarkerClick: jest.Mock;
      detectResizeHandle: jest.Mock;
      getSelectedIndices: jest.Mock;
      onMouseDown(core: object, event: object): boolean | void;
      getResizeState(): { dragTarget: { initialSizes: Map<number, number> } | null };
    };
    plugin.detectHiddenMarkerClick = jest.fn(() => null) as never;
    plugin.detectResizeHandle = jest
      .fn()
      .mockReturnValueOnce({ type: 'row', primaryIndex: 1, initialSizes: new Map([[1, 0]]) })
      .mockReturnValueOnce({ type: 'col', primaryIndex: 2, initialSizes: new Map([[2, 0]]) }) as never;

    const rowSizes = { getItem: jest.fn((_r: number, idx: number) => (idx === 1 ? 13 : 17)) };
    const columnSizes = { getItem: jest.fn((_r: number, idx: number) => (idx === 2 ? 22 : 0)) };
    const appliedTransactions: Transaction[] = [];
    const core = {
      appliedTransactions,
      executePipeline: createPipelineExecutor(appliedTransactions),
      requestRender: jest.fn(),
      getDataEngine: () => createResizeDataEngine({ rowSizes, columnSizes }),
    };

    plugin.getSelectedIndices = jest.fn(() => [1, 2]);
    expect(plugin.onMouseDown(core, { origin: { offsetX: 1, offsetY: 1 } })).toBe(false);
    expect(plugin.getResizeState().dragTarget?.initialSizes).toEqual(
      new Map([
        [1, 13],
        [2, 17],
      ]),
    );

    plugin.getSelectedIndices = jest.fn(() => null);
    expect(plugin.onMouseDown(core, { origin: { offsetX: 2, offsetY: 2 } })).toBe(false);
    expect(plugin.getResizeState().dragTarget?.initialSizes).toEqual(new Map([[2, 22]]));
  });

  it('covers remaining handle-type branches for selected and non-selected drag initialization', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals & {
      detectHiddenMarkerClick: jest.Mock;
      detectResizeHandle: jest.Mock;
      getSelectedIndices: jest.Mock;
      onMouseDown(core: object, event: object): boolean | void;
      getResizeState(): { dragTarget: { initialSizes: Map<number, number> } | null };
    };
    plugin.detectHiddenMarkerClick = jest.fn(() => null) as never;
    plugin.detectResizeHandle = jest
      .fn()
      .mockReturnValueOnce({ type: 'col', primaryIndex: 1, initialSizes: new Map([[1, 0]]) })
      .mockReturnValueOnce({ type: 'row', primaryIndex: 2, initialSizes: new Map([[2, 0]]) }) as never;

    const appliedTransactions: Transaction[] = [];
    const core = {
      appliedTransactions,
      executePipeline: createPipelineExecutor(appliedTransactions),
      requestRender: jest.fn(),
      getDataEngine: () =>
        createResizeDataEngine({
          rowSizes: { getItem: jest.fn((_r: number, idx: number) => (idx === 2 ? 31 : 0)) },
          columnSizes: { getItem: jest.fn((_r: number, idx: number) => (idx === 1 ? 26 : 0)) },
        }),
    };

    plugin.getSelectedIndices = jest.fn(() => [1]);
    expect(plugin.onMouseDown(core, { origin: { offsetX: 1, offsetY: 1 } })).toBe(false);
    expect(plugin.getResizeState().dragTarget?.initialSizes).toEqual(new Map([[1, 26]]));

    plugin.getSelectedIndices = jest.fn(() => null);
    expect(plugin.onMouseDown(core, { origin: { offsetX: 2, offsetY: 2 } })).toBe(false);
    expect(plugin.getResizeState().dragTarget?.initialSizes).toEqual(new Map([[2, 31]]));
  });

  it('falls back to minimum size when plugin state is missing during drag initialization', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals & {
      detectHiddenMarkerClick: jest.Mock;
      detectResizeHandle: jest.Mock;
      getSelectedIndices: jest.Mock;
      onMouseDown(core: object, event: object): boolean | void;
      getResizeState(): { dragTarget: { initialSizes: Map<number, number> } | null };
    };
    plugin.detectHiddenMarkerClick = jest.fn(() => null) as never;
    plugin.detectResizeHandle = jest
      .fn()
      .mockReturnValueOnce({ type: 'row', primaryIndex: 1, initialSizes: new Map([[1, 0]]) })
      .mockReturnValueOnce({ type: 'col', primaryIndex: 2, initialSizes: new Map([[2, 0]]) })
      .mockReturnValueOnce({ type: 'col', primaryIndex: 4, initialSizes: new Map([[4, 0]]) }) as never;

    const appliedTransactions: Transaction[] = [];
    const core = {
      appliedTransactions,
      executePipeline: createPipelineExecutor(appliedTransactions),
      requestRender: jest.fn(),
      pluginManager: { getPluginState: jest.fn(() => void 0) },
    };

    plugin.getSelectedIndices = jest.fn(() => [1]);
    expect(plugin.onMouseDown(core, { origin: { offsetX: 1, offsetY: 1 } })).toBe(false);
    expect(plugin.getResizeState().dragTarget?.initialSizes).toEqual(new Map([[1, 0]]));

    plugin.getSelectedIndices = jest.fn(() => [2]);
    expect(plugin.onMouseDown(core, { origin: { offsetX: 2, offsetY: 2 } })).toBe(false);
    expect(plugin.getResizeState().dragTarget?.initialSizes).toEqual(new Map([[2, 0]]));

    plugin.getSelectedIndices = jest.fn(() => null);
    expect(plugin.onMouseDown(core, { origin: { offsetX: 3, offsetY: 3 } })).toBe(false);
    expect(plugin.getResizeState().dragTarget?.initialSizes).toEqual(new Map([[4, 0]]));
  });

  it('covers getSelectedIndices guard and success branches for row and column selections', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals;
    const bounds = {
      getPoint: jest.fn((index: number) => {
        if (index === 0) return [1, 0];
        if (index === 1) return [3, 4];
        return null;
      }),
    };

    const nullSelectionCore = {
      pluginManager: { getPluginState: jest.fn(() => null) },
    };
    expect(plugin.getSelectedIndices(nullSelectionCore, 'row', 1)).toBeNull();

    const missingBoundsCore = {
      pluginManager: {
        getPluginState: jest.fn().mockReturnValueOnce([null, null]),
      },
    };
    expect(plugin.getSelectedIndices(missingBoundsCore, 'row', 1)).toBeNull();

    const missingPointsCore = {
      pluginManager: {
        getPluginState: jest.fn().mockReturnValueOnce([bounds, { getPoint: () => null }]),
      },
    };
    expect(plugin.getSelectedIndices(missingPointsCore, 'row', 1)).toBeNull();

    const missingDataCore = {
      pluginManager: {
        getPluginState: jest.fn().mockReturnValueOnce([bounds, bounds]).mockReturnValueOnce(null),
      },
    };
    expect(plugin.getSelectedIndices(missingDataCore, 'row', 1)).toBeNull();

    const rowState = {
      rowSizes: { shape: [1, 6] },
      columnSizes: { shape: [1, 5] },
    };
    const rowCore = {
      getDataEngine: () => createResizeDataEngine(rowState),
      pluginManager: {
        getPluginState: jest.fn().mockReturnValueOnce([bounds, bounds]),
      },
    };
    expect(plugin.getSelectedIndices(rowCore, 'row', 0)).toBeNull();

    const rowCoreOutOfRange = {
      getDataEngine: () => createResizeDataEngine(rowState),
      pluginManager: {
        getPluginState: jest.fn().mockReturnValueOnce([bounds, bounds]),
      },
    };
    expect(plugin.getSelectedIndices(rowCoreOutOfRange, 'row', 4)).toBeNull();

    const rowCoreSelected = {
      getDataEngine: () => createResizeDataEngine(rowState),
      pluginManager: {
        getPluginState: jest.fn().mockReturnValueOnce([bounds, bounds]),
      },
    };
    expect(plugin.getSelectedIndices(rowCoreSelected, 'row', 2)).toEqual([1, 2, 3]);

    const rowNotFullWidthBounds = {
      getPoint: jest.fn((index: number) => (index === 0 ? [1, 1] : [3, 3])),
    };
    const rowNotFullWidthCore = {
      getDataEngine: () => createResizeDataEngine(rowState),
      pluginManager: {
        getPluginState: jest.fn().mockReturnValueOnce([rowNotFullWidthBounds, rowNotFullWidthBounds]),
      },
    };
    expect(plugin.getSelectedIndices(rowNotFullWidthCore, 'row', 2)).toBeNull();

    const columnBounds = {
      getPoint: jest.fn((index: number) => (index === 0 ? [0, 2] : [5, 4])),
    };
    const colState = {
      rowSizes: { shape: [1, 6] },
      columnSizes: { shape: [1, 6] },
    };
    const columnCore = {
      getDataEngine: () => createResizeDataEngine(colState),
      pluginManager: {
        getPluginState: jest.fn().mockReturnValueOnce([columnBounds, columnBounds]),
      },
    };
    expect(plugin.getSelectedIndices(columnCore, 'col', 1)).toBeNull();

    const columnCoreOutOfRange = {
      getDataEngine: () => createResizeDataEngine(colState),
      pluginManager: {
        getPluginState: jest.fn().mockReturnValueOnce([columnBounds, columnBounds]),
      },
    };
    expect(plugin.getSelectedIndices(columnCoreOutOfRange, 'col', 5)).toBeNull();

    const columnCoreSelected = {
      getDataEngine: () => createResizeDataEngine(colState),
      pluginManager: {
        getPluginState: jest.fn().mockReturnValueOnce([columnBounds, columnBounds]),
      },
    };
    expect(plugin.getSelectedIndices(columnCoreSelected, 'col', 3)).toEqual([2, 3, 4]);

    const colNotFullHeightBounds = {
      getPoint: jest.fn((index: number) => (index === 0 ? [1, 2] : [4, 4])),
    };
    const colNotFullHeightCore = {
      getDataEngine: () => createResizeDataEngine(colState),
      pluginManager: {
        getPluginState: jest.fn().mockReturnValueOnce([colNotFullHeightBounds, colNotFullHeightBounds]),
      },
    };
    expect(plugin.getSelectedIndices(colNotFullHeightCore, 'col', 3)).toBeNull();
  });

  it('resolves previous row/column boundaries and swallows dimension lookup errors', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals;
    const rowSizes = {
      getRightBoundaryColIndexByDimension: jest.fn(() => 2),
      getDimensionRightBoundaryByIndex: jest.fn((index: number) => (index === 2 ? 200 : 40)),
      getItem: jest.fn((_: number, index: number) => (index === 1 ? 18 : 0)),
    };
    const columnSizes = {
      getRightBoundaryColIndexByDimension: jest.fn(() => 2),
      getDimensionRightBoundaryByIndex: jest.fn((index: number) => (index === 2 ? 300 : 60)),
      getItem: jest.fn((_: number, index: number) => (index === 1 ? 22 : 0)),
    };

    const core = {
      getDataEngine: () => createResizeDataEngine({ rowSizes, columnSizes }),
    };

    expect(
      plugin.detectResizeHandle(core, {
        world: { x: 300, y: 68 },
        view: { x: 10, y: 40 },
      }),
    ).toEqual(expect.objectContaining({ type: 'row', primaryIndex: 1 }));

    const rowCurrent = plugin.detectResizeHandle(core, {
      world: { x: 0, y: 224 },
      view: { x: 10, y: 40 },
    });
    expect(rowCurrent).toEqual(expect.objectContaining({ type: 'row', primaryIndex: 2 }));

    expect(
      plugin.detectResizeHandle(core, {
        world: { x: 118, y: 10 },
        view: { x: 90, y: 10 },
      }),
    ).toEqual(expect.objectContaining({ type: 'col', primaryIndex: 1 }));

    const colCurrent = plugin.detectResizeHandle(core, {
      world: { x: 350, y: 10 },
      view: { x: 90, y: 10 },
    });
    expect(colCurrent).toEqual(expect.objectContaining({ type: 'col', primaryIndex: 2 }));

    const throwingCore = {
      pluginManager: {
        getPluginState: jest.fn(() => ({
          rowSizes: {
            getRightBoundaryColIndexByDimension: () => {
              throw new Error('row');
            },
          },
          columnSizes: {
            getRightBoundaryColIndexByDimension: () => {
              throw new Error('col');
            },
          },
        })),
      },
    };

    expect(
      plugin.detectResizeHandle(throwingCore, {
        world: { x: 10, y: 40 },
        view: { x: 10, y: 40 },
      }),
    ).toBeNull();
  });

  it('keeps searching when previous boundary probes do not hit resize handles', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals;
    const core = {
      pluginManager: {
        getPluginState: jest.fn(() => ({
          rowSizes: {
            getRightBoundaryColIndexByDimension: jest.fn(() => 2),
            getDimensionRightBoundaryByIndex: jest.fn((index: number) => (index === 2 ? 200 : 140)),
            getItem: jest.fn(() => 15),
          },
          columnSizes: {
            getRightBoundaryColIndexByDimension: jest.fn(() => 2),
            getDimensionRightBoundaryByIndex: jest.fn((index: number) => (index === 2 ? 300 : 240)),
            getItem: jest.fn(() => 18),
          },
        })),
      },
    };

    expect(
      plugin.detectResizeHandle(core, {
        world: { x: 0, y: 180 },
        view: { x: 10, y: 40 },
      }),
    ).toBeNull();
    expect(
      plugin.detectResizeHandle(core, {
        world: { x: 310, y: 10 },
        view: { x: 90, y: 10 },
      }),
    ).toBeNull();
  });

  it('skips previous-boundary probing when resolved row/column index is zero', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals;
    const core = {
      pluginManager: {
        getPluginState: jest.fn(() => ({
          rowSizes: {
            getRightBoundaryColIndexByDimension: jest.fn(() => 0),
            getDimensionRightBoundaryByIndex: jest.fn(() => 80),
            getItem: jest.fn(() => 18),
          },
          columnSizes: {
            getRightBoundaryColIndexByDimension: jest.fn(() => 0),
            getDimensionRightBoundaryByIndex: jest.fn(() => 100),
            getItem: jest.fn(() => 24),
          },
        })),
      },
    };

    expect(
      plugin.detectResizeHandle(core, {
        world: { x: 0, y: 130 },
        view: { x: 10, y: 40 },
      }),
    ).toBeNull();
    expect(
      plugin.detectResizeHandle(core, {
        world: { x: 170, y: 10 },
        view: { x: 90, y: 10 },
      }),
    ).toBeNull();
  });

  it('uses fallback size for previous boundary handles when stored size is missing', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals;
    const core = {
      getDataEngine: () =>
        createResizeDataEngine({
          rowSizes: {
            getRightBoundaryColIndexByDimension: jest.fn(() => 2),
            getDimensionRightBoundaryByIndex: jest.fn((index: number) => (index === 2 ? 200 : 40)),
            getItem: jest.fn(() => void 0),
          },
          columnSizes: {
            getRightBoundaryColIndexByDimension: jest.fn(() => 2),
            getDimensionRightBoundaryByIndex: jest.fn((index: number) => (index === 2 ? 300 : 60)),
            getItem: jest.fn(() => void 0),
          },
        }),
    };

    const rowPrev = plugin.detectResizeHandle(core, {
      world: { x: 0, y: 68 },
      view: { x: 10, y: 40 },
    });
    const colPrev = plugin.detectResizeHandle(core, {
      world: { x: 118, y: 10 },
      view: { x: 90, y: 10 },
    });

    expect(rowPrev?.initialSizes.get(1)).toBe(0);
    expect(colPrev?.initialSizes.get(1)).toBe(0);
  });

  it('builds initial drag sizes for column handles with and without selected indices', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals & {
      detectHiddenMarkerClick: jest.Mock;
      detectResizeHandle: jest.Mock;
      getSelectedIndices: jest.Mock;
      getResizeState(): { dragTarget: { initialSizes: Map<number, number> } | null };
      cursorEngine: { override: jest.Mock };
    };

    plugin.detectHiddenMarkerClick = jest.fn(() => null) as never;
    plugin.detectResizeHandle = jest.fn(() => ({
      type: 'col',
      primaryIndex: 2,
      initialSizes: new Map([[2, 10]]),
    })) as never;

    const appliedTransactions: Transaction[] = [];
    const core = {
      getDataEngine: () =>
        createResizeDataEngine({
          rowSizes: { getItem: jest.fn(() => 20) },
          columnSizes: {
            getItem: jest.fn((_r: number, c: number) => (c === 2 ? 15 : 0)),
          },
        }),
      appliedTransactions,
      executePipeline: createPipelineExecutor(appliedTransactions),
      requestRender: jest.fn(),
    };

    plugin.getSelectedIndices = jest.fn(() => [2, 3]);
    expect(plugin.onMouseDown(core, { origin: { offsetX: 1, offsetY: 1 } })).toBe(false);
    expect(plugin.cursorEngine.override).toHaveBeenCalledWith('col-resize');
    expect(plugin.getResizeState().dragTarget?.initialSizes).toEqual(
      new Map([
        [2, 15],
        [3, 0],
      ]),
    );

    plugin.getSelectedIndices = jest.fn(() => null);
    expect(plugin.onMouseDown(core, { origin: { offsetX: 2, offsetY: 2 } })).toBe(false);
    expect(plugin.getResizeState().dragTarget?.initialSizes).toEqual(new Map([[2, 15]]));
  });

  it('continues and commits a resize from document-level pointer capture', () => {
    const pointerCapture = new TestPointerCapture();
    const plugin = createPlugin(
      jest.fn(() => ({ width: 10, height: 8 })),
      createResizeTestCommandBus(),
      void 0,
      void 0,
      pointerCapture,
    ) as unknown as ResizePluginInternals & {
      detectHiddenMarkerClick: jest.Mock;
      detectResizeHandle: jest.Mock;
      getSelectedIndices: jest.Mock;
      getResizeState(): { isDragging: boolean; currentWorld: { x: number; y: number } | null };
    };
    plugin.detectHiddenMarkerClick = jest.fn(() => null) as never;
    plugin.detectResizeHandle = jest.fn(() => ({
      type: 'col',
      primaryIndex: 2,
      initialSizes: new Map([[2, 15]]),
    })) as never;
    plugin.getSelectedIndices = jest.fn(() => null);
    const appliedTransactions: Transaction[] = [];
    const core = {
      getDataEngine: () =>
        createResizeDataEngine({
          rowSizes: { getItem: jest.fn(() => 20) },
          columnSizes: { getItem: jest.fn(() => 15) },
        }),
      executePipeline: createPipelineExecutor(appliedTransactions),
      requestRender: jest.fn(),
    };
    currentCore = core;

    expect(
      plugin.onMouseDown(core, {
        origin: { offsetX: 1, offsetY: 2 },
      }),
    ).toBe(false);
    expect(pointerCapture.capture).not.toBeNull();

    pointerCapture.capture?.onMove?.({ view: { x: 31, y: 2 } });
    expect(plugin.getResizeState().currentWorld).toEqual({ x: 41, y: 22 });

    pointerCapture.capture?.onRelease({ view: { x: 41, y: 2 } });

    expect(readResizeOperation(appliedTransactions[0])[MatrixOTActionName.ResizeCol]).toEqual({ value: 55, prev: 15 });
    expect(plugin.getResizeState().isDragging).toBe(false);
    expect(pointerCapture.capture).toBeNull();
  });

  it('consumes the follow-up double-click after auto-fitting from the second resize-handle mousedown', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals & {
      detectHiddenMarkerClick: jest.Mock;
      detectResizeHandle: jest.Mock;
      dispatchAutoFit: jest.Mock;
      cursorEngine: { override: jest.Mock };
      getResizeState(): { isDragging: boolean };
      onDblClick(core: object, event: object): boolean | void;
    };
    const target = { type: 'col', primaryIndex: 2, initialSizes: new Map([[2, 30]]) };
    plugin.detectHiddenMarkerClick = jest.fn(() => null) as never;
    plugin.detectResizeHandle = jest.fn(() => target) as never;
    plugin.dispatchAutoFit = jest.fn();
    const core = { pluginManager: { getPluginState: jest.fn() } };

    expect(plugin.onMouseDown(core, { origin: { offsetX: 1, offsetY: 2 }, clickCount: 2 })).toBe(false);
    expect(plugin.dispatchAutoFit).toHaveBeenCalledWith(core, target);
    expect(plugin.cursorEngine.override).not.toHaveBeenCalled();
    expect(plugin.getResizeState().isDragging).toBe(false);

    plugin.detectResizeHandle.mockReturnValue(null);
    expect(plugin.onDblClick(core, { origin: { offsetX: 1, offsetY: 2 } })).toBe(false);
    expect(plugin.dispatchAutoFit).toHaveBeenCalledTimes(1);
    expect(plugin.onDblClick(core, { origin: { offsetX: 1, offsetY: 2 } })).toBe(void 0);
  });

  it('auto-fits only when a resize handle is double-clicked', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals & {
      onDblClick(core: object, event: object): boolean | void;
      detectResizeHandle: jest.Mock;
      dispatchAutoFit: jest.Mock;
    };
    plugin.detectResizeHandle = jest.fn(() => null) as never;
    plugin.dispatchAutoFit = jest.fn();
    const core = { pluginManager: { getPluginState: jest.fn() } };
    const event = { origin: { offsetX: 1, offsetY: 2 } };

    expect(plugin.onDblClick(core, event)).toBe(void 0);
    expect(plugin.dispatchAutoFit).not.toHaveBeenCalled();

    const target = { type: 'col', primaryIndex: 2, initialSizes: new Map([[2, 30]]) };
    plugin.detectResizeHandle.mockReturnValue(target);

    expect(plugin.onDblClick(core, event)).toBe(false);
    expect(plugin.dispatchAutoFit).toHaveBeenCalledWith(core, target);
  });

  it('dispatches resize operations and remembers sizes hidden at zero', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals;
    const core = createCore();

    plugin.dispatchResize(
      core,
      { type: 'row', primaryIndex: 2, initialSizes: new Map([[2, 12]]) },
      { x: 0, y: 10 },
      { x: 0, y: -2 },
    );

    expect(core.appliedTransactions).toHaveLength(1);
    expect(readResizeOperation(core.appliedTransactions[0])[MatrixOTActionName.ResizeRow]).toEqual({
      value: 0,
      prev: 12,
    });

    plugin.dispatchUnhide(
      {
        ...core,
        getDataEngine: () =>
          createResizeDataEngine({
            rowSizes: { getItem: jest.fn((_row: number, index: number) => (index === 2 ? 0 : 24)) },
            rowHiddenOriginalSizes: createHiddenOriginalSizeMatrix([[2, 12]]),
          }),
      },
      'row',
      2,
    );

    expect(core.appliedTransactions).toHaveLength(2);
    expect(readResizeOperation(core.appliedTransactions[1])[MatrixOTActionName.ResizeRow]).toEqual({
      value: 12,
      prev: 0,
    });

    // Column unhide path
    plugin.dispatchResize(
      core,
      { type: 'col', primaryIndex: 4, initialSizes: new Map([[4, 15]]) },
      { x: 10, y: 0 },
      { x: -20, y: 0 },
    );
    plugin.dispatchUnhide(
      {
        ...core,
        getDataEngine: () =>
          createResizeDataEngine({
            columnSizes: { getItem: jest.fn((_row: number, index: number) => (index === 4 ? 0 : 100)) },
            columnHiddenOriginalSizes: createHiddenOriginalSizeMatrix([[4, 15]]),
          }),
      },
      'col',
      4,
    );

    expect(readResizeOperation(core.appliedTransactions[3])[MatrixOTActionName.ResizeCol]).toEqual({
      value: 15,
      prev: 0,
    });
  });

  it('emits resize OT for zero, positive, and already-zero resize results', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals;
    const core = createCore();

    plugin.dispatchResize(
      core,
      { type: 'row', primaryIndex: 1, initialSizes: new Map([[1, 12]]) },
      { x: 0, y: 20 },
      { x: 0, y: 0 },
    );
    expect(readResizeOperation(core.appliedTransactions[0])[MatrixOTActionName.ResizeRow]).toEqual({
      value: 0,
      prev: 12,
    });

    plugin.dispatchResize(
      core,
      { type: 'row', primaryIndex: 4, initialSizes: new Map([[4, 10]]) },
      { x: 0, y: 10 },
      { x: 0, y: 15 },
    );
    expect(readResizeOperation(core.appliedTransactions[1])[MatrixOTActionName.ResizeRow]).toEqual({
      value: 15,
      prev: 10,
    });

    plugin.dispatchResize(
      core,
      { type: 'row', primaryIndex: 5, initialSizes: new Map([[5, 0]]) },
      { x: 0, y: 0 },
      { x: 0, y: -5 },
    );
    expect(readResizeOperation(core.appliedTransactions[2])[MatrixOTActionName.ResizeRow]).toEqual({
      value: 0,
      prev: 0,
    });
  });

  it('emits column resize transactions with the horizontal delta', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals;
    const core = createCore();

    plugin.dispatchResize(
      core,
      { type: 'col', primaryIndex: 1, initialSizes: new Map([[1, 30]]) },
      { x: 4, y: 0 },
      { x: 19, y: 0 },
    );

    expect(readResizeOperation(core.appliedTransactions[0])[MatrixOTActionName.ResizeCol]).toEqual({
      value: 45,
      prev: 30,
    });
  });

  it('BUG-914 gives selected rows and columns the dragged item size while preserving their old sizes', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals;
    const core = createCore();

    plugin.dispatchResize(
      core,
      { type: 'row', primaryIndex: 2, initialSizes: new Map([[1, 24], [2, 58]]) },
      { x: 0, y: 0 },
      { x: 0, y: 30 },
    );
    expect(core.appliedTransactions[0].operations).toHaveLength(2);
    expect(readResizeOperation(core.appliedTransactions[0], 0)[MatrixOTActionName.ResizeRow]).toEqual({ value: 88, prev: 24 });
    expect(readResizeOperation(core.appliedTransactions[0], 1)[MatrixOTActionName.ResizeRow]).toEqual({ value: 88, prev: 58 });

    plugin.dispatchResize(
      core,
      { type: 'col', primaryIndex: 1, initialSizes: new Map([[0, 76], [1, 100]]) },
      { x: 0, y: 0 },
      { x: 57, y: 0 },
    );
    expect(core.appliedTransactions[1].operations).toHaveLength(2);
    expect(readResizeOperation(core.appliedTransactions[1], 0)[MatrixOTActionName.ResizeCol]).toEqual({ value: 157, prev: 76 });
    expect(readResizeOperation(core.appliedTransactions[1], 1)[MatrixOTActionName.ResizeCol]).toEqual({ value: 157, prev: 100 });
  });

  it('auto-fits a column from sparse cell measurements', () => {
    const measureLines = jest
      .fn()
      .mockReturnValueOnce({ width: 14, height: 8 })
      .mockReturnValueOnce({ width: 35, height: 12 });
    const plugin = createPlugin(measureLines) as unknown as ResizePluginInternals;
    const core = {
      ...createCore(),
      getDataEngine: () => createResizeDataEngine(dataState),
      renderEngine: {
        renderContext: {},
        renderCoordinatorManager: { createCellContext: jest.fn(() => ({})) },
      },
    };
    const dataState = {
      sheetData: {
        forEachStored: jest.fn((callback: (cell: object, row: number, col: number) => void) => {
          callback({}, 0, 1);
          callback({}, 1, 1);
          callback({}, 0, 2);
        }),
        forEachStoredInRow: jest.fn(),
      },
      columnSizes: { getItem: jest.fn(() => 20) },
      rowSizes: { getItem: jest.fn(() => 20) },
    };

    plugin.dispatchAutoFit(core, {
      type: 'col',
      primaryIndex: 1,
      initialSizes: new Map([[1, 20]]),
    });

    expect(readResizeOperation(core.appliedTransactions[0])[MatrixOTActionName.ResizeCol]).toEqual({
      value: 51,
      prev: 20,
    });
  });

  it('auto-fits a row from its stored cell heights', () => {
    const measureLines = jest.fn(() => ({ width: 10, height: 19 }));
    const plugin = createPlugin(measureLines) as unknown as ResizePluginInternals;
    const dataState = {
      sheetData: {
        forEachStored: jest.fn(),
        forEachStoredInRow: jest.fn((row: number, callback: (cell: object, col: number) => void) => {
          expect(row).toBe(2);
          callback({}, 0);
        }),
      },
      columnSizes: { getItem: jest.fn(() => 20) },
      rowSizes: { getItem: jest.fn(() => 11) },
    };
    const core = {
      ...createCore(),
      getDataEngine: () => createResizeDataEngine(dataState),
      renderEngine: {
        renderContext: {},
        renderCoordinatorManager: { createCellContext: jest.fn(() => ({})) },
      },
    };

    plugin.dispatchAutoFit(core, {
      type: 'row',
      primaryIndex: 2,
      initialSizes: new Map([[2, 11]]),
    });

    expect(readResizeOperation(core.appliedTransactions[0])[MatrixOTActionName.ResizeRow]).toEqual({
      value: 35,
      prev: 11,
    });
  });

  it('auto-fits projected cells without stored Sheet entries on both axes', () => {
    const plugin = createPlugin(jest.fn(() => ({ width: 140, height: 22 }))) as unknown as
      ResizePluginInternals & Pick<SheetResizePlugin, 'setProjectedCells'>;
    const projectedRanges: number[][] = [];
    plugin.setProjectedCells({
      forEachProjectedCellInRange(startRow, startColumn, endRow, endColumn, visit) {
        projectedRanges.push([startRow, startColumn, endRow, endColumn]);
        visit({ type: 'formula' }, 0, 1);
      },
    });
    const dataState = {
      sheetData: {
        shape: [10, 5],
        getItem: jest.fn(() => null),
        forEachStored: jest.fn(),
        forEachStoredInRow: jest.fn(),
      },
      columnSizes: { getItem: jest.fn(() => 100) },
      rowSizes: { getItem: jest.fn(() => 24) },
    };
    const core = {
      ...createCore(),
      getDataEngine: () => createResizeDataEngine(dataState),
      renderEngine: {
        renderContext: {},
        renderCoordinatorManager: { createCellContext: jest.fn(() => ({})) },
      },
    };

    plugin.dispatchAutoFit(core, { type: 'col', primaryIndex: 1, initialSizes: new Map([[1, 100]]) });
    plugin.dispatchAutoFit(core, { type: 'row', primaryIndex: 0, initialSizes: new Map([[0, 24]]) });

    expect(projectedRanges).toEqual([[0, 1, 9, 1], [0, 0, 0, 4]]);
    expect(readResizeOperation(core.appliedTransactions[0])[MatrixOTActionName.ResizeCol]).toEqual({ value: 156, prev: 100 });
    expect(readResizeOperation(core.appliedTransactions[1])[MatrixOTActionName.ResizeRow]).toEqual({ value: 38, prev: 24 });
  });

  it('renders an overlay resize guide while a column drag is active', () => {
    container.registerInstance(Tree.symbol, {
      getBoundary: jest.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
      updateBoundary: jest.fn(),
    } as never);
    container.registerInstance(ConfigEngine.symbol, {} as never);
    const plugin = createPlugin(void 0, null) as unknown as ResizePluginInternals & {
      render(core: object): Array<{
        properties: { type: string; isEdit?: boolean };
      }> | null;
    };
    setUnassembledDragState(plugin, {
      dragTarget: {
        type: 'col',
        primaryIndex: 1,
        initialSizes: new Map([[1, 30]]),
      },
      dragStartWorld: { x: 10, y: 0 },
      currentWorld: { x: 25, y: 0 },
    });
    const core = {
      getDataEngine: () =>
        createResizeDataEngine({
          columnSizes: {
            getDimensionLeftBoundaryByIndex: jest.fn(() => 80),
          },
        }),
      renderEngine: {
        scrollManager: {
          getShape: jest.fn(() => [400, 300]),
          getState: jest.fn(() => ({ x: 5, y: 7 })),
        },
      },
    };

    expect(plugin.render(core)).toEqual([
      expect.objectContaining({
        properties: expect.objectContaining({
          type: 'resize-guide',
          isEdit: true,
        }),
      }),
    ]);
  });

  it('renders an overlay resize guide while a row drag is active', () => {
    container.registerInstance(Tree.symbol, {
      getBoundary: jest.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
      updateBoundary: jest.fn(),
    } as never);
    container.registerInstance(ConfigEngine.symbol, {} as never);
    const plugin = createPlugin(void 0, null) as unknown as ResizePluginInternals & {
      render(core: object): Array<{ properties: { type: string; isEdit?: boolean } }> | null;
    };
    setUnassembledDragState(plugin, {
      dragTarget: {
        type: 'row',
        primaryIndex: 1,
        initialSizes: new Map([[1, 15]]),
      },
      dragStartWorld: { x: 0, y: 10 },
      currentWorld: { x: 0, y: 30 },
    });
    const core = {
      getDataEngine: () =>
        createResizeDataEngine({
          rowSizes: {
            getDimensionLeftBoundaryByIndex: jest.fn(() => 60),
          },
        }),
      renderEngine: {
        scrollManager: {
          getShape: jest.fn(() => [400, 300]),
          getState: jest.fn(() => ({ x: 5, y: 7 })),
        },
      },
    };

    expect(plugin.render(core)).toEqual([
      expect.objectContaining({
        properties: expect.objectContaining({
          type: 'resize-guide',
          isEdit: true,
        }),
      }),
    ]);
  });

  it('covers TriangleNode rendering and hidden marker generation', () => {
    container.registerInstance(Tree.symbol, {
      getBoundary: jest.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
      updateBoundary: jest.fn(),
      insert: jest.fn(),
      remove: jest.fn(),
    } as never);
    container.registerInstance(ConfigEngine.symbol, {} as never);

    const plugin = createPlugin() as any;

    const core = {
      getDataEngine: () =>
        createResizeDataEngine({
          rowSizes: { getDimensionRightBoundaryByIndex: () => 20 },
          columnSizes: { getDimensionRightBoundaryByIndex: () => 20 },
          rowHiddenOriginalSizes: createHiddenOriginalSizeMatrix([[1, 10]]),
          columnHiddenOriginalSizes: createHiddenOriginalSizeMatrix([[1, 10]]),
        }),
      renderEngine: { scrollManager: { getShape: () => [100, 100], getState: () => ({ x: 0, y: 0 }) } },
    };

    const nodes = plugin.renderHiddenMarkers(core);
    expect(nodes).toBeDefined();
    expect(nodes.length).toBe(4);

    const ctx = {
      save: jest.fn(),
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      closePath: jest.fn(),
      setFillStyle: jest.fn(),
      fill: jest.fn(),
      restore: jest.fn(),
      clearRect: jest.fn(),
      rect: jest.fn(),
    };

    nodes[0].fill = 'red';
    nodes[0].drawScene(ctx as any);
    nodes[0].clear(ctx as any);
    nodes[0].drawHit(ctx as any);

    nodes[0].properties.skipHit = false;
    nodes[0].randomColorKey = 'blue';
    nodes[0].drawHit(ctx as any);

    nodes[0].points = [];
    nodes[0].drawScene(ctx as any);
  });

  it('handles early returns when plugin state is missing', () => {
    const plugin = createPlugin(void 0, null) as any;
    const core = {
      pluginManager: {
        getPluginState: jest.fn(() => null),
      },
      renderEngine: { scrollManager: { getShape: () => [100, 100], getState: () => ({ x: 0, y: 0 }) } },
    };

    expect(plugin.renderHiddenMarkers(core)).toBeNull();
    expect(plugin.detectHiddenMarkerClick(core, { world: { x: 0, y: 0 }, view: { x: 0, y: 0 } })).toBeNull();

    setUnassembledDragState(plugin, {
      dragTarget: { type: 'row', primaryIndex: 1, initialSizes: new Map([[1, 10]]) },
      dragStartWorld: { x: 10, y: 0 },
      currentWorld: { x: 25, y: 0 },
    });
    const nodes = plugin.render(core);
    expect(nodes).toBeNull();

    // AutoFit missing metrics
    const appliedTransactions: Transaction[] = [];
    const coreMetrics = {
      appliedTransactions,
      executePipeline: createPipelineExecutor(appliedTransactions),
      pluginManager: {
        getPluginState: jest.fn(() => ({ sheetData: {}, rowSizes: {}, columnSizes: {} })),
      },
    };
    (plugin as unknown as { textShaper: TextShaper | undefined }).textShaper = undefined;
    plugin.dispatchAutoFit(coreMetrics, { type: 'row', primaryIndex: 1, initialSizes: new Map() });
    expect(appliedTransactions).toHaveLength(0);
  });

  it('detects hidden column marker clicks in header area', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals & {
      detectHiddenMarkerClick: (
        core: object,
        pointer: { world: { x: number; y: number }; view: { x: number; y: number }; region?: string },
      ) => { type: 'row' | 'col'; index: number } | null;
    };

    const result = plugin.detectHiddenMarkerClick(
      {
        getDataEngine: () =>
          createResizeDataEngine({
            rowSizes: { getDimensionRightBoundaryByIndex: () => 0 },
            columnSizes: { getDimensionRightBoundaryByIndex: () => 40 },
            rowHiddenOriginalSizes: createHiddenOriginalSizeMatrix(),
            columnHiddenOriginalSizes: createHiddenOriginalSizeMatrix([[2, 30]]),
          }),
      },
      {
        world: { x: 90, y: 10 },
        view: { x: 90, y: 10 },
        region: 'columnHeader',
      },
    );

    expect(result).toEqual({ type: 'col', index: 2 });

    const noMatch = plugin.detectHiddenMarkerClick(
      {
        getDataEngine: () =>
          createResizeDataEngine({
            rowSizes: { getDimensionRightBoundaryByIndex: () => 10 },
            columnSizes: { getDimensionRightBoundaryByIndex: () => 10 },
            rowHiddenOriginalSizes: createHiddenOriginalSizeMatrix(),
            columnHiddenOriginalSizes: createHiddenOriginalSizeMatrix(),
          }),
      },
      {
        world: { x: 999, y: 999 },
        view: { x: 999, y: 999 },
      },
    );
    expect(noMatch).toBeNull();

    expect(
      plugin.detectHiddenMarkerClick(
        {
          getDataEngine: () =>
            createResizeDataEngine({
              rowSizes: { getDimensionRightBoundaryByIndex: () => 10 },
              columnSizes: { getDimensionRightBoundaryByIndex: () => 10 },
              rowHiddenOriginalSizes: createHiddenOriginalSizeMatrix([[1, 20]]),
              columnHiddenOriginalSizes: createHiddenOriginalSizeMatrix(),
            }),
        },
        {
          world: { x: 120, y: 10 },
          view: { x: 120, y: 10 },
          region: 'columnHeader',
        },
      ),
    ).toBeNull();
  });

  it('keeps scanning hidden markers when header is active but marker distance does not match', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals;

    const core = {
      getDataEngine: () =>
        createResizeDataEngine({
          rowSizes: { getDimensionRightBoundaryByIndex: () => 10 },
          columnSizes: { getDimensionRightBoundaryByIndex: () => 10 },
          rowHiddenOriginalSizes: createHiddenOriginalSizeMatrix([[2, 20]]),
          columnHiddenOriginalSizes: createHiddenOriginalSizeMatrix([[2, 20]]),
        }),
    };

    expect(
      plugin.detectHiddenMarkerClick(core, {
        world: { x: 5, y: 200 },
        view: { x: 5, y: 40 },
      }),
    ).toBeNull();

    expect(
      plugin.detectHiddenMarkerClick(core, {
        world: { x: 200, y: 5 },
        view: { x: 60, y: 5 },
      }),
    ).toBeNull();
  });

  it('handles hidden-marker row matching and unknown-key no-op paths', () => {
    container.registerInstance(Tree.symbol, {
      getBoundary: jest.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
      updateBoundary: jest.fn(),
      insert: jest.fn(),
      remove: jest.fn(),
    } as never);
    container.registerInstance(ConfigEngine.symbol, {} as never);

    const plugin = createPlugin() as unknown as ResizePluginInternals & {
      renderHiddenMarkers: (core: object) => Array<object> | null;
      render: (core: object) => Array<object> | null;
    };

    const rowMatch = plugin.detectHiddenMarkerClick(
      {
        getDataEngine: () =>
          createResizeDataEngine({
            rowSizes: { getDimensionRightBoundaryByIndex: (index: number) => (index === 1 ? 40 : 0) },
            columnSizes: { getDimensionRightBoundaryByIndex: () => 0 },
            rowHiddenOriginalSizes: createHiddenOriginalSizeMatrix([[1, 20]]),
            columnHiddenOriginalSizes: createHiddenOriginalSizeMatrix([[3, 25]]),
          }),
      },
      {
        world: { x: 5, y: 64 },
        view: { x: 5, y: 64 },
      },
    );

    expect(rowMatch).toEqual({ type: 'row', index: 1 });

    expect(
      plugin.renderHiddenMarkers({
        getDataEngine: () =>
          createResizeDataEngine({
            rowSizes: { getDimensionRightBoundaryByIndex: () => 0 },
            columnSizes: { getDimensionRightBoundaryByIndex: () => 0 },
            rowHiddenOriginalSizes: createHiddenOriginalSizeMatrix(),
            columnHiddenOriginalSizes: createHiddenOriginalSizeMatrix(),
          }),
      }),
    ).toBeNull();

    const markerRender = plugin.render({
      getDataEngine: () =>
        createResizeDataEngine({
          rowSizes: { getDimensionRightBoundaryByIndex: () => 40 },
          columnSizes: { getDimensionRightBoundaryByIndex: () => 0 },
          rowHiddenOriginalSizes: createHiddenOriginalSizeMatrix([[1, 20]]),
          columnHiddenOriginalSizes: createHiddenOriginalSizeMatrix(),
        }),
      renderEngine: {
        scrollManager: { getShape: () => [100, 100], getState: () => ({ x: 0, y: 0 }) },
      },
    });
    expect(markerRender).toBeTruthy();
  });

  it('returns early on unhide when no hidden size exists and on autofit without plugin state', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals;
    const core = createCore();

    plugin.dispatchUnhide(core, 'row', 999);
    expect(core.appliedTransactions).toHaveLength(0);

    plugin.dispatchUnhide(core, 'row', 0);
    expect(core.appliedTransactions).toHaveLength(0);

    const platform = { warn: jest.fn() };
    const missingManagerPlugin = createPlugin(
      void 0,
      createResizeTestCommandBus(),
      platform,
    ) as unknown as ResizePluginInternals;
    missingManagerPlugin.dispatchUnhide({} as never, 'row', 0);
    expect(platform.warn).not.toHaveBeenCalledWith(
      'SheetResizePlugin dispatchUnhide skipped: PluginManager is missing.',
    );

    plugin.dispatchAutoFit(
      {
        getDataEngine: () => ({ readDataViewField: () => null }),
      },
      { type: 'col', primaryIndex: 2, initialSizes: new Map([[2, 10]]) },
    );
    expect(core.appliedTransactions).toHaveLength(0);
  });

  it('covers optional hidden-size lookups and hidden-marker early exits', () => {
    const plugin = createPlugin(void 0, createResizeTestCommandBus()) as unknown as ResizePluginInternals;

    plugin.dispatchUnhide({} as never, 'row', 0);

    const appliedTransactions: Transaction[] = [];
    const core = {
      appliedTransactions,
      executePipeline: createPipelineExecutor(appliedTransactions),
      getDataEngine: () =>
        createResizeDataEngine({
          rowSizes: { getDimensionRightBoundaryByIndex: (index: number) => (index + 1) * 20 },
          columnSizes: { getDimensionRightBoundaryByIndex: (index: number) => (index + 1) * 30 },
          rowHiddenOriginalSizes: createHiddenOriginalSizeMatrix(),
          columnHiddenOriginalSizes: createHiddenOriginalSizeMatrix(),
        }),
    };
    currentCore = core;

    plugin.dispatchUnhide(core, 'row', 1);
    plugin.dispatchUnhide(core, 'col', 1);
    const missingStateCore = {
      ...core,
      getDataEngine: () => ({ readDataViewField: () => null }),
    };
    plugin.dispatchUnhide(missingStateCore, 'row', 1);
    plugin.dispatchUnhide(missingStateCore, 'col', 1);
    expect(appliedTransactions).toHaveLength(0);

    expect(
      plugin.detectHiddenMarkerClick(core, {
        world: { x: 5, y: 40 },
        view: { x: 5, y: 40 },
      }),
    ).toBeNull();
    expect(
      plugin.detectHiddenMarkerClick(core, {
        world: { x: 90, y: 5 },
        view: { x: 90, y: 5 },
      }),
    ).toBeNull();

    const rowHiddenOriginalSizes = createHiddenOriginalSizeMatrix([
      [0, 20],
      [1, 30],
    ]);
    const columnHiddenOriginalSizes = createHiddenOriginalSizeMatrix([
      [0, 30],
      [1, 40],
    ]);
    const hitCore = {
      getDataEngine: () =>
        createResizeDataEngine({
          rowSizes: { getDimensionRightBoundaryByIndex: (index: number) => index * 20 },
          columnSizes: { getDimensionRightBoundaryByIndex: (index: number) => index * 30 },
          rowHiddenOriginalSizes,
          columnHiddenOriginalSizes,
        }),
    };

    expect(
      plugin.detectHiddenMarkerClick(hitCore, {
        world: { x: 5, y: 24 },
        view: { x: 5, y: 40 },
      }),
    ).toEqual({ type: 'row', index: 0 });
    expect(rowHiddenOriginalSizes.forEachStored).toHaveBeenCalledTimes(1);

    expect(
      plugin.detectHiddenMarkerClick(hitCore, {
        world: { x: 50, y: 5 },
        view: { x: 90, y: 5 },
      }),
    ).toEqual({ type: 'col', index: 0 });
    expect(columnHiddenOriginalSizes.forEachStored).toHaveBeenCalledTimes(1);
  });

  it('returns early from autofit when selected indices are empty and when drag render lacks column state', () => {
    const plugin = createPlugin(void 0, null) as unknown as ResizePluginInternals & {
      getSelectedIndices: jest.Mock;
      dispatchAutoFit: ResizePluginInternals['dispatchAutoFit'];
      render: (core: object) => Array<object> | null;
    };

    plugin.getSelectedIndices = jest.fn(() => []);

    const appliedTransactions: Transaction[] = [];
    const core = {
      appliedTransactions,
      executePipeline: createPipelineExecutor(appliedTransactions),
      getDataEngine: () =>
        createResizeDataEngine({
          sheetData: {
            forEachStored: jest.fn(),
            forEachStoredInRow: jest.fn(),
          },
          rowSizes: { getItem: jest.fn(() => 10) },
          columnSizes: { getItem: jest.fn(() => 10) },
        }),
      renderEngine: {
        renderContext: {},
        renderCoordinatorManager: { createCellContext: jest.fn(() => ({})) },
      },
    };

    plugin.dispatchAutoFit(core, { type: 'row', primaryIndex: 1, initialSizes: new Map([[1, 10]]) });
    expect(appliedTransactions).toHaveLength(0);

    setUnassembledDragState(plugin, {
      dragTarget: { type: 'col', primaryIndex: 1, initialSizes: new Map([[1, 12]]) },
      dragStartWorld: { x: 0, y: 0 },
      currentWorld: { x: 10, y: 0 },
    });

    const nodes = plugin.render({
      getDataEngine: () => ({ readDataViewField: () => null }),
      renderEngine: {
        scrollManager: { getShape: () => [200, 100], getState: () => ({ x: 0, y: 0 }) },
      },
    });
    expect(nodes).toBeNull();
  });

  it('BUG-1158 INT15-013 does not hide empty rows or columns during autofit', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals & {
      getSelectedIndices: jest.Mock;
      displayTextRegistry: { getDisplayText: jest.Mock };
    };

    plugin.getSelectedIndices = jest.fn(() => [1]);
    plugin.displayTextRegistry.getDisplayText = jest.fn(() => '');

    const appliedTransactions: Transaction[] = [];
    const core = {
      appliedTransactions,
      executePipeline: createPipelineExecutor(appliedTransactions),
      getDataEngine: () =>
        createResizeDataEngine({
          sheetData: {
            forEachStored: jest.fn((cb: (cell: object, r: number, c: number) => void) => cb({}, 0, 1)),
            forEachStoredInRow: jest.fn((row: number, cb: (cell: object, c: number) => void) => cb({}, 1)),
          },
          rowSizes: { getItem: jest.fn(() => 0) },
          columnSizes: { getItem: jest.fn(() => 0) },
        }),
      renderEngine: {
        renderContext: {},
        renderCoordinatorManager: { createCellContext: jest.fn(() => ({})) },
      },
    };
    currentCore = core;

    plugin.dispatchAutoFit(core, { type: 'col', primaryIndex: 1, initialSizes: new Map([[1, 10]]) });
    plugin.dispatchAutoFit(core, { type: 'row', primaryIndex: 1, initialSizes: new Map([[1, 10]]) });

    expect(appliedTransactions).toHaveLength(0);
  });

  it('BUG-1158 INT15-013 keeps empty targets unchanged when auto-fitting a mixed selection', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals & {
      getSelectedIndices: jest.Mock;
    };
    plugin.getSelectedIndices = jest.fn(() => [1, 2]);
    const appliedTransactions: Transaction[] = [];
    const core = {
      appliedTransactions,
      executePipeline: createPipelineExecutor(appliedTransactions),
      getDataEngine: () => createResizeDataEngine({
        sheetData: {
          forEachStored: jest.fn((callback: (cell: object, row: number, col: number) => void) => {
            callback({}, 0, 2);
          }),
          forEachStoredInRow: jest.fn((row: number, callback: (cell: object, col: number) => void) => {
            if (row === 2) callback({}, 1);
          }),
        },
        rowSizes: { getItem: jest.fn(() => 24) },
        columnSizes: { getItem: jest.fn(() => 100) },
      }),
      renderEngine: {
        renderContext: {},
        renderCoordinatorManager: { createCellContext: jest.fn(() => ({})) },
      },
    };
    currentCore = core;

    plugin.dispatchAutoFit(core, { type: 'col', primaryIndex: 1, initialSizes: new Map([[1, 100], [2, 100]]) });
    plugin.dispatchAutoFit(core, { type: 'row', primaryIndex: 1, initialSizes: new Map([[1, 24], [2, 24]]) });

    expect(appliedTransactions).toHaveLength(2);
    expect(appliedTransactions[0].operations[0].p).toEqual([2]);
    expect(appliedTransactions[1].operations[0].p).toEqual([2]);
  });

  it('skips autofit when sparse width lookups have no measured content', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals & {
      getSelectedIndices: jest.Mock;
      dispatchAutoFit: ResizePluginInternals['dispatchAutoFit'];
    };
    plugin.getSelectedIndices = jest.fn(() => [1]);

    const getSpy = jest.spyOn(Map.prototype, 'get');
    const originalGet = getSpy.getMockImplementation() ?? Map.prototype.get;
    let forceUndefinedCalls = 0;
    getSpy.mockImplementation(function getSparseMapValue(this: Map<unknown, unknown>, key: unknown) {
      if (key === 1 && forceUndefinedCalls < 2) {
        forceUndefinedCalls += 1;
        return void 0;
      }
      return originalGet.call(this, key);
    });

    const appliedTransactions: Transaction[] = [];
    const core = {
      appliedTransactions,
      executePipeline: createPipelineExecutor(appliedTransactions),
      getDataEngine: () =>
        createResizeDataEngine({
          sheetData: {
            forEachStored: jest.fn((cb: (cell: object, row: number, col: number) => void) => cb({}, 0, 1)),
            forEachStoredInRow: jest.fn(),
          },
          rowSizes: { getItem: jest.fn(() => 0) },
          columnSizes: { getItem: jest.fn(() => 10) },
        }),
      renderEngine: {
        renderContext: {},
        renderCoordinatorManager: { createCellContext: jest.fn(() => ({})) },
      },
    };
    currentCore = core;

    try {
      plugin.dispatchAutoFit(core, { type: 'col', primaryIndex: 1, initialSizes: new Map([[1, 10]]) });
    } finally {
      getSpy.mockRestore();
    }

    expect(appliedTransactions).toHaveLength(0);
  });

  it('covers triangle node drawScene and drawHit branches when fill/color are absent', () => {
    container.registerInstance(Tree.symbol, {
      getBoundary: jest.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
      updateBoundary: jest.fn(),
      insert: jest.fn(),
      remove: jest.fn(),
    } as never);
    container.registerInstance(ConfigEngine.symbol, {} as never);

    const plugin = createPlugin() as any;
    const core = {
      getDataEngine: () =>
        createResizeDataEngine({
          rowSizes: { getDimensionRightBoundaryByIndex: () => 20 },
          columnSizes: { getDimensionRightBoundaryByIndex: () => 20 },
          rowHiddenOriginalSizes: createHiddenOriginalSizeMatrix([[1, 10]]),
          columnHiddenOriginalSizes: createHiddenOriginalSizeMatrix(),
        }),
      renderEngine: { scrollManager: { getShape: () => [100, 100], getState: () => ({ x: 0, y: 0 }) } },
    };
    const node = plugin.renderHiddenMarkers(core)[0];
    const ctx = {
      save: jest.fn(),
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      closePath: jest.fn(),
      setFillStyle: jest.fn(),
      fill: jest.fn(),
      restore: jest.fn(),
      clearRect: jest.fn(),
      rect: jest.fn(),
    };

    node.fill = void 0;
    node.drawScene(ctx as any);
    expect(ctx.setFillStyle).not.toHaveBeenCalled();

    node.properties.skipHit = false;
    node.randomColorKey = void 0;
    node.drawHit(ctx as any);
    expect(ctx.fill).toHaveBeenCalled();
  });

  it('resets resize state on mouseup even when no drag session is active', () => {
    const plugin = createPlugin() as unknown as ResizePluginInternals & {
      onMouseUp(core: object, event: object): void;
      getResizeState(): {
        isDragging: boolean;
        dragTarget: unknown;
        dragStartWorld: unknown;
        currentWorld: unknown;
      };
    };
    const core = {
      executePipeline: (pipeline: Pipeline) => pipeline.steps.forEach((step) => step.localAction?.()),
      requestRender: jest.fn(),
      renderEngine: {
        markDirty: jest.fn(),
        scrollManager: { getShape: () => [100, 100], getState: () => ({ x: 0, y: 0 }) },
      },
    };

    plugin.onMouseUp(core, { origin: { offsetX: 1, offsetY: 1 } });
    expect(core.renderEngine.markDirty).not.toHaveBeenCalled();
    expect(core.requestRender).toHaveBeenCalledWith(plugin);
    expect(plugin.getResizeState()).toEqual({
      isDragging: false,
      dragTarget: null,
      dragStartWorld: null,
      currentWorld: null,
    });
  });

  it('returns marker nodes when dragging row or column but plugin state is missing', () => {
    container.registerInstance(Tree.symbol, {
      getBoundary: jest.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
      updateBoundary: jest.fn(),
      insert: jest.fn(),
      remove: jest.fn(),
    } as never);
    container.registerInstance(ConfigEngine.symbol, {} as never);

    const plugin = createPlugin(void 0, null) as unknown as ResizePluginInternals & {
      render(core: object): Array<object> | null;
    };

    const markerState = {
      rowSizes: { getDimensionRightBoundaryByIndex: () => 40 },
      columnSizes: { getDimensionRightBoundaryByIndex: () => 20 },
      rowHiddenOriginalSizes: createHiddenOriginalSizeMatrix([[1, 10]]),
      columnHiddenOriginalSizes: createHiddenOriginalSizeMatrix(),
    };

    setUnassembledDragState(plugin, {
      dragTarget: { type: 'row', primaryIndex: 1, initialSizes: new Map() },
      dragStartWorld: { x: 0, y: 0 },
      currentWorld: { x: 0, y: 10 },
    });
    const rowNodes = plugin.render({
      getDataEngine: () => createResizeDataEngine(markerState),
      renderEngine: {
        scrollManager: { getShape: () => [200, 100], getState: () => ({ x: 0, y: 0 }) },
      },
    });
    expect(rowNodes).toBeTruthy();

    setUnassembledDragState(plugin, {
      dragTarget: { type: 'col', primaryIndex: 1, initialSizes: new Map() },
      dragStartWorld: { x: 0, y: 0 },
      currentWorld: { x: 10, y: 0 },
    });
    const colNodes = plugin.render({
      getDataEngine: () => createResizeDataEngine(markerState),
      renderEngine: {
        scrollManager: { getShape: () => [200, 100], getState: () => ({ x: 0, y: 0 }) },
      },
    });
    expect(colNodes).toBeTruthy();
  });

  it('exposes helper methods for cell metrics and command dispatch', () => {
    const commands = new SheetCommandBus();
    commands.bind({ executePipeline: createPipelineExecutor(), applyEffect: () => void 0 });
    const measureLines = jest.fn(() => ({ width: 9, height: 8 }));
    const plugin = createPlugin(measureLines, commands) as unknown as ResizePluginInternals & {
      measureCellMetrics: (text: string, font: string) => { width: number; height: number };
      runCommand: <Input>(core: object, definition: { id: string }, input: Input) => void;
      commands: SheetCommandBus | undefined;
    };
    const core = createCore();

    expect(plugin.measureCellMetrics('abc', '16px sans-serif')).toEqual({
      width: 9,
      height: 8,
    });

    plugin.runCommand(core as never, BeginSheetResizeDragCommand, {
      axis: 'row',
      primaryIndex: 2,
      initialSizes: [{ index: 2, size: 24 }],
      world: { x: 1, y: 2 },
    });
    expect(plugin.commands?.has(BeginSheetResizeDragCommand)).toBe(true);
  });

  it('warns instead of creating a resize-only command bus when commands are missing', () => {
    const platform = { warn: jest.fn() };
    const plugin = createPlugin(void 0, null, platform) as unknown as ResizePluginInternals & {
      runCommand: <Input>(core: object, definition: { id: string }, input: Input) => void;
    };

    plugin.runCommand({} as never, BeginSheetResizeDragCommand, {
      axis: 'row',
      primaryIndex: 0,
      initialSizes: [],
      world: { x: 0, y: 0 },
    });

    expect(platform.warn).toHaveBeenCalledWith('SheetResizePlugin runCommand skipped: SheetCommandBus is missing.');
  });

  it('skips command dispatch without throwing when commands and platform are both missing', () => {
    const plugin = createPlugin(void 0, null) as unknown as ResizePluginInternals & {
      runCommand: <Input>(core: object, definition: { id: string }, input: Input) => void;
    };

    expect(() =>
      plugin.runCommand({} as never, BeginSheetResizeDragCommand, {
        axis: 'row',
        primaryIndex: 0,
        initialSizes: [],
        world: { x: 0, y: 0 },
      }),
    ).not.toThrow();
  });
});
