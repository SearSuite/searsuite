import { Container } from '@searsuite/sear-foundation-di';
import { DataEngine } from '@searsuite/sear-domain-state';
import { SheetFormulaPriority } from '@searsuite/sear-assembly-sheet-kernel';
import { bindSheetFormulaPriority } from '../src/sheet/bindSheetFormulaPriority';
import { SheetMatrix } from '@searsuite/sear-domain-sheet';
import { CellType } from '@searsuite/sear-domain-cell-types';
import { FormulaErrorCode } from '@searsuite/sear-domain-formula-engine';
import {
  AggregationCache,
  FormulaEvaluator,
  FormulaParser,
  FunctionRegistry,
  cellKey,
} from '@searsuite/sear-domain-formula-engine-ts';
import { ColumnShapeDimensionsCSRMatrix, CSRMatrix, RowShapeDimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import { type Platform } from '@searsuite/sear-foundation-platform';
import { SheetDataPlugin } from '@searsuite/sear-plugin-sheet-data';
import { SheetDataFieldNamespace, SheetDataMatrixFieldKey } from '@searsuite/sear-domain-sheet';
import { SheetDataEngine } from '@searsuite/sear-domain-sheet';
import { ScrollManager } from '@searsuite/sear-render-scroll';
import { CellFormulaValueConverterRegistry, FormulaResultStore } from '@searsuite/sear-plugin-formula';
import {
  SheetColumnSizesFieldKey,
  SheetResizePlugin,
  SheetRowHiddenOriginalSizesFieldKey,
  SheetRowSizesFieldKey,
} from '@searsuite/sear-plugin-resize';
import { ChineseExcelDateTimeLocale } from '@searsuite/sear-domain-formula-engine-ts';
import { SheetFormulaSchedulerDataSource } from '@searsuite/sear-assembly-sheet-kernel';

function createPlatform(): Platform {
  return {
    warn: jest.fn(),
    now: () => 0,
    currentDateTime: () => 1_728_864_000_000,
    queueMicrotask: (callback: () => void): void => callback(),
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    createId: (prefix = 'test') => `${prefix}-1`,
    toLowerCase: (value: string) => value.toLowerCase(),
    addEventListener: () => () => {},
    observeResize: () => () => {},
    readViewOffset: () => ({ x: 0, y: 0 }),
  } as Platform;
}

function registerSheetData(dataEngine: SheetDataEngine, sheetData: SheetMatrix): void {
  dataEngine.registerDataType(
    SheetDataPlugin.pluginKey,
    { sheetData },
    {
      dataView: [
        {
          viewKey: SheetDataFieldNamespace,
          fieldKey: SheetDataMatrixFieldKey,
          select: (state) => state.sheetData,
        },
      ],
    },
  );
}

function registerDimensions(
  dataEngine: SheetDataEngine,
  rowSizes: RowShapeDimensionsCSRMatrix,
  columnSizes: ColumnShapeDimensionsCSRMatrix,
): CSRMatrix<number> {
  const rowHiddenOriginalSizes = new CSRMatrix<number>(void 0, [1, rowSizes.shape[1]]);
  dataEngine.registerDataType(
    SheetResizePlugin.pluginKey,
    {
      dimensions: {
        rowSizes,
        columnSizes,
        rowHiddenOriginalSizes,
        columnHiddenOriginalSizes: new CSRMatrix<number>(void 0, [1, columnSizes.shape[1]]),
      },
    },
    {
      dataView: [
        {
          viewKey: SheetDataFieldNamespace,
          fieldKey: SheetRowSizesFieldKey,
          select: (state) => state.dimensions.rowSizes,
        },
        {
          viewKey: SheetDataFieldNamespace,
          fieldKey: SheetColumnSizesFieldKey,
          select: (state) => state.dimensions.columnSizes,
        },
        {
          viewKey: SheetDataFieldNamespace,
          fieldKey: SheetRowHiddenOriginalSizesFieldKey,
          select: (state) => state.dimensions.rowHiddenOriginalSizes,
        },
      ],
    },
  );
  return rowHiddenOriginalSizes;
}

function createDimensionMatrices(): {
  rowSizes: RowShapeDimensionsCSRMatrix;
  columnSizes: ColumnShapeDimensionsCSRMatrix;
} {
  const rowSizes = new RowShapeDimensionsCSRMatrix(void 0, [1, 5]);
  const columnSizes = new ColumnShapeDimensionsCSRMatrix(void 0, [1, 5]);
  rowSizes.setDefaultValue(10);
  columnSizes.setDefaultValue(10);
  return { rowSizes, columnSizes };
}

describe('SheetFormulaSchedulerDataSource', () => {
  it('projects the first visible cell into formula metadata', () => {
    const dataEngine = new SheetDataEngine();
    const platform = createPlatform();
    registerSheetData(dataEngine, new SheetMatrix(void 0, [100, 10]));
    const rowSizes = new RowShapeDimensionsCSRMatrix(void 0, [1, 100]);
    const columnSizes = new ColumnShapeDimensionsCSRMatrix(void 0, [1, 10]);
    rowSizes.setDefaultValue(24);
    columnSizes.setDefaultValue(100);
    registerDimensions(dataEngine, rowSizes, columnSizes);
    const scroll = new ScrollManager(300, 300);
    const dataSource = new SheetFormulaSchedulerDataSource(dataEngine, formulaPriority(dataEngine, scroll), platform);
    const results = new FormulaResultStore(new CellFormulaValueConverterRegistry(platform));

    expect(dataSource.getVisibleOrigin()).toEqual({ row: 0, col: 0 });
    scroll.scrollTo(0, 479);
    expect(dataSource.getVisibleOrigin()).toEqual({ row: 19, col: 0 });
    scroll.scrollTo(230, 480);
    expect(dataSource.getVisibleOrigin()).toEqual({ row: 20, col: 2 });
    expect(dataSource.createEvalContext(results).metadata?.readVisibleOrigin?.()).toEqual({ row: 20, col: 2 });
  });

  it('projects default and resized column widths for CELL metadata', () => {
    const dataEngine = new SheetDataEngine();
    const platform = createPlatform();
    registerSheetData(dataEngine, new SheetMatrix(void 0, [1, 2]));
    const rowSizes = new RowShapeDimensionsCSRMatrix(void 0, [1, 1]);
    const columnSizes = new ColumnShapeDimensionsCSRMatrix(void 0, [1, 2]);
    columnSizes.setDefaultValue(100);
    columnSizes.addItem(0, 1, 140);
    registerDimensions(dataEngine, rowSizes, columnSizes);
    const resultStore = new FormulaResultStore(new CellFormulaValueConverterRegistry(platform));
    const dataSource = new SheetFormulaSchedulerDataSource(
      dataEngine,
      formulaPriority(dataEngine, new ScrollManager(20, 20)),
      platform,
    );
    const metadata = dataSource.createEvalContext(resultStore).metadata;

    expect(metadata?.readCell({ row: 0, col: 0 })?.width).toBe(14);
    expect(metadata?.readCell({ row: 0, col: 1 })?.width).toBe(19);
  });

  it('marks only rows with hidden dimensions or saved original sizes as hidden', () => {
    const dataEngine = new SheetDataEngine();
    const platform = createPlatform();
    const sheetData = new SheetMatrix({ data: [], indices: [0], indptr: [] }, [3, 1]);
    sheetData.addItem(0, 0, { type: CellType.Number, value: 3 });
    sheetData.addItem(1, 0, { type: CellType.Number, value: 4 });
    sheetData.addItem(2, 0, { type: CellType.Number, value: 5 });
    registerSheetData(dataEngine, sheetData);
    const rowSizes = new RowShapeDimensionsCSRMatrix(void 0, [1, 3]);
    const columnSizes = new ColumnShapeDimensionsCSRMatrix(void 0, [1, 1]);
    const hiddenRows = registerDimensions(dataEngine, rowSizes, columnSizes);
    hiddenRows.addItem(0, 1, 10);
    const resultStore = new FormulaResultStore(new CellFormulaValueConverterRegistry(platform));
    const dataSource = new SheetFormulaSchedulerDataSource(
      dataEngine,
      formulaPriority(dataEngine, new ScrollManager(20, 20)),
      platform,
    );

    expect(
      Array.from(dataSource.createEvalContext(resultStore).iterateRangeCells!(0, 0, 2, 0), (cell) => cell.hidden),
    ).toEqual([false, true, false]);
  });

  it('creates eval context from DataEngine sheet data', () => {
    const dataEngine = new SheetDataEngine();
    const scrollManager = new ScrollManager(20, 20);
    const platform = createPlatform();
    const sheetData = new SheetMatrix({ data: [], indices: [0], indptr: [] }, [2, 2]);
    sheetData.addItem(0, 0, { type: CellType.Number, value: 3 });
    sheetData.addItem(0, 1, { type: CellType.Formula, formula: '=A1+1' });
    registerSheetData(dataEngine, sheetData);

    const resultStore = new FormulaResultStore(new CellFormulaValueConverterRegistry(platform));
    resultStore.set(cellKey(0, 1), 4);
    const dataSource = new SheetFormulaSchedulerDataSource(
      dataEngine,
      formulaPriority(dataEngine, scrollManager),
      platform,
    );
    const context = dataSource.createEvalContext(resultStore);

    expect(context.getSheetShape?.()).toEqual([2, 2]);
    expect(context.currentDateTime?.()).toBe(1_728_864_000_000);
    expect(context.dateTimeLocale).toBeUndefined();
    expect(context.isCellInBounds(1, 1)).toBe(true);
    expect(context.isCellInBounds(2, 0)).toBe(false);
    expect(context.getCellValue(0, 0)).toBe(3);
    expect(context.getCellValue(0, 1)).toBe(4);
    expect(context.referenceResolver?.resolve('B2')).toEqual({
      source: { kind: 'currentSheet' },
      startRow: 1,
      startCol: 1,
      endRow: 1,
      endCol: 1,
    });
    expect(context.referenceResolver?.resolve('R[-1]C[1]', { style: 'R1C1', currentCell: { row: 1, col: 0 } })).toEqual(
      {
        source: { kind: 'currentSheet' },
        startRow: 0,
        startCol: 1,
        endRow: 0,
        endCol: 1,
      },
    );
    expect(context.referenceResolver?.resolve('C3')).toEqual({ kind: 'error', code: FormulaErrorCode.Reference });
    expect(context.getCellValue(2, 0)).toEqual({ kind: 'error', code: FormulaErrorCode.Reference });
    expect(Array.from(context.iterateRange(0, 0, 0, 1))).toEqual([3, 4]);
    expect(Array.from(context.iterateRange(-1, 0, 0, 1))).toEqual([
      { kind: 'error', code: FormulaErrorCode.Reference },
    ]);
  });

  it('exposes projected spill values to references, ranges, and CELL metadata', () => {
    const dataEngine = new SheetDataEngine();
    const platform = createPlatform();
    const sheetData = new SheetMatrix(void 0, [3, 3]);
    sheetData.addItem(0, 0, { type: CellType.Formula, formula: '=SEQUENCE(2,2)' });
    registerSheetData(dataEngine, sheetData);
    const results = new FormulaResultStore(new CellFormulaValueConverterRegistry(platform));
    results.setFormulaResult(
      cellKey(0, 0),
      [
        [1, 2],
        [3, 4],
      ],
      {
        isCellInBounds: () => true,
        isCellOccupied: () => false,
      },
    );
    const context = new SheetFormulaSchedulerDataSource(
      dataEngine,
      formulaPriority(dataEngine, new ScrollManager(20, 20)),
      platform,
    ).createEvalContext(results);

    expect(context.getCellValue(0, 0)).toBe(1);
    expect(context.getCellValue(0, 1)).toBe(2);
    expect([...context.iterateRange(0, 1, 1, 1)]).toEqual([2, 4]);
    expect([...context.iterateRangeCells!(0, 1, 1, 1)].map(({ value, source }) => [value, source])).toEqual([
      [2, 'value'],
      [4, 'value'],
    ]);
    expect(context.metadata?.readCell({ row: 0, col: 1 })).toMatchObject({ value: 2, source: 'value' });
    const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
    expect(evaluator.evaluate(new FormulaParser().parse('=SUM(B1:B2)'), context)).toBe(6);
  });

  it('adds the current formula locale to eval context when a locale provider is available', () => {
    const dataEngine = new SheetDataEngine();
    const scrollManager = new ScrollManager(20, 20);
    const platform = createPlatform();
    const sheetData = new SheetMatrix({ data: [], indices: [0], indptr: [] }, [1, 1]);
    registerSheetData(dataEngine, sheetData);
    const resultStore = new FormulaResultStore(new CellFormulaValueConverterRegistry(platform));
    const dataSource = new SheetFormulaSchedulerDataSource(
      dataEngine,
      formulaPriority(dataEngine, scrollManager),
      platform,
      {
        getDateTimeLocale: () => ChineseExcelDateTimeLocale,
      },
    );

    const context = dataSource.createEvalContext(resultStore);

    expect(context.dateTimeLocale).toBe(ChineseExcelDateTimeLocale);
  });

  it('returns a reference-error context when sheet data is unavailable', () => {
    const dataEngine = new SheetDataEngine();
    const scrollManager = new ScrollManager(20, 20);
    const platform = createPlatform();
    const resultStore = new FormulaResultStore(new CellFormulaValueConverterRegistry(platform));
    const dataSource = new SheetFormulaSchedulerDataSource(
      dataEngine,
      formulaPriority(dataEngine, scrollManager),
      platform,
    );

    const context = dataSource.createEvalContext(resultStore);

    expect(context.getSheetShape?.()).toEqual([0, 0]);
    expect(context.isCellInBounds(0, 0)).toBe(false);
    expect(context.getCellValue(0, 0)).toEqual({ kind: 'error', code: FormulaErrorCode.Reference });
    expect(Array.from(context.iterateRange(0, 0, 0, 0))).toEqual([{ kind: 'error', code: FormulaErrorCode.Reference }]);
    expect(platform.warn).toHaveBeenCalledWith(
      'FormulaSchedulerDataSource createEvalContext fell back: sheet data field is missing.',
    );
  });

  it('filters formula keys to the current viewport', () => {
    const dataEngine = new SheetDataEngine();
    const scrollManager = new ScrollManager(15, 15);
    const platform = createPlatform();
    const { rowSizes, columnSizes } = createDimensionMatrices();
    registerDimensions(dataEngine, rowSizes, columnSizes);
    const dataSource = new SheetFormulaSchedulerDataSource(
      dataEngine,
      formulaPriority(dataEngine, scrollManager),
      platform,
    );

    const viewportKeys = dataSource.getViewportFormulaKeys([
      cellKey(0, 0),
      cellKey(2, 2),
      cellKey(3, 3),
      cellKey(0, 4),
    ]);

    expect(viewportKeys).toEqual(new Set([cellKey(0, 0), cellKey(2, 2)]));
  });

  it('returns an empty viewport when dimension fields are unavailable', () => {
    const dataEngine = new SheetDataEngine();
    const scrollManager = new ScrollManager(15, 15);
    const platform = createPlatform();
    const dataSource = new SheetFormulaSchedulerDataSource(
      dataEngine,
      formulaPriority(dataEngine, scrollManager),
      platform,
    );

    expect(dataSource.getViewportFormulaKeys([cellKey(0, 0)])).toEqual(new Set());
  });

  it('delegates viewport-change subscriptions to ScrollManager', () => {
    const dataEngine = new SheetDataEngine();
    const scrollManager = new ScrollManager(15, 15);
    const platform = createPlatform();
    const dataSource = new SheetFormulaSchedulerDataSource(
      dataEngine,
      formulaPriority(dataEngine, scrollManager),
      platform,
    );
    const handler = jest.fn();
    const dispose = dataSource.onViewportChanged(handler);

    scrollManager.scrollTo(1, 1);
    expect(handler).toHaveBeenCalledTimes(1);

    dispose();
    scrollManager.scrollTo(2, 2);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

function formulaPriority(data: SheetDataEngine, scroll: ScrollManager): SheetFormulaPriority {
  const container = new Container();
  const priority = new SheetFormulaPriority();
  container.registerInstance(DataEngine.symbol, data);
  container.registerInstance(SheetFormulaPriority.symbol, priority);
  bindSheetFormulaPriority(container, scroll);
  return priority;
}
