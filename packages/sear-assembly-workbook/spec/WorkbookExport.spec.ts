import {
  createDefaultSheetDocumentStateExportRegistry,
  type SheetDocumentState,
} from '@searsuite/sear-assembly-sheet-state';
import { CellType } from '@searsuite/sear-domain-cell-types';
import { CSRMatrix, ColumnShapeDimensionsCSRMatrix, RowShapeDimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import { createWorkbookDocumentState } from '@searsuite/sear-domain-workbook';
import { DocumentStateCodecRegistry, ExportError, ExportErrorCode } from '@searsuite/sear-plugin-export';
import { SheetMatrix } from '@searsuite/sear-domain-sheet';
import { AlignmentMatrix, VerticalAlignmentMatrix } from '@searsuite/sear-plugin-alignment';
import { CellFillMatrix } from '@searsuite/sear-plugin-cell-fill';
import { CellHighlightKind, CellHighlightMatrix, CellHighlightStyle } from '@searsuite/sear-plugin-cell-highlight';
import { CellBorderMatrix, SheetBorderLineStyle } from '@searsuite/sear-plugin-cell-border';
import { DuplicateMatrix } from '@searsuite/sear-plugin-duplicate';
import { CellFormatMatrix } from '@searsuite/sear-plugin-cell-format';
import { CellMergeMatrix } from '@searsuite/sear-plugin-cell-merge';
import { FixedRowMatrix } from '@searsuite/sear-plugin-fixed-row';
import {
  deserializeWorkbookDocumentState,
  serializeWorkbookDocumentState,
} from '@searsuite/sear-assembly-workbook-kernel';
import { WorkbookFormulaEvaluationRuntime } from '@searsuite/sear-assembly-workbook-kernel';

interface ExtendedSheetDocumentState extends SheetDocumentState {
  readonly backgroundColors: CSRMatrix<string>;
}

describe('Workbook export JSON', () => {
  it('persists stable sheet ids for cross-sheet formula references', () => {
    const main = createSheetState([2, 2]);
    main.sheetData.addItem(0, 0, { type: CellType.Formula, formula: '=Data!A1' });
    const workbook = createWorkbookDocumentState({
      id: 'book',
      sheets: [
        { id: 'main', name: 'Main' },
        { id: 'data', name: 'Data' },
      ],
      sheetStates: { main, data: createSheetState([2, 2]) },
    });
    const file = serializeWorkbookDocumentState(workbook);
    expect(file.workbook.formulaBindings).toEqual([
      {
        sheetId: 'main',
        row: 0,
        col: 0,
        formula: '=Data!A1',
        references: [{ sheetName: 'Data', sheetId: 'data' }],
      },
    ]);
    const restored = deserializeWorkbookDocumentState({
      ...file,
      workbook: {
        ...file.workbook,
        sheets: [
          { id: 'main', name: 'Main' },
          { id: 'data', name: 'Renamed' },
        ],
      },
    });
    const compiled = new WorkbookFormulaEvaluationRuntime().compileFormula(
      { sheetId: 'main', row: 0, col: 0 },
      '=Data!A1',
      restored,
    );
    expect(compiled.dependencies).toEqual([{ sheetId: 'data', row: 0, col: 0 }]);
  });

  it('roundtrips workbook structure through registered Sheet document-state codecs', () => {
    const sheetOne = createSheetState([4, 5]);
    sheetOne.cellBorders = new CellBorderMatrix(void 0, [4, 5]);
    sheetOne.cellBorders.setItem(1, 1, { top: { color: '#256cfb', style: SheetBorderLineStyle.Double } });
    sheetOne.sheetData.addItem(0, 0, { type: CellType.String, value: 'hello' });
    sheetOne.sheetData.addItem(1, 1, { type: CellType.Number, value: 42 });
    sheetOne.cellFormats.addItem(1, 1, {
      kind: 'number',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    sheetOne.sheetData.addItem(2, 2, {
      type: CellType.RichText,
      value: [{ type: 'paragraph', content: [{ type: 'text', text: 'rich', attrs: { textStyle: { bold: true } } }] }],
    });
    sheetOne.sheetData.addItem(3, 3, { type: CellType.Formula, formula: '=Sheet2!A1+1' });
    sheetOne.rowSizes.addItem(0, 1, 40);
    sheetOne.columnSizes.addItem(0, 2, 120);
    sheetOne.cellAlignments.addItem(1, 1, 'right');
    sheetOne.cellVerticalAlignments.addItem(1, 1, 'bottom');
    sheetOne.cellFills.addItem(1, 1, '#e6f0ff');
    sheetOne.cellHighlights.setItem(1, 1, [
      {
        id: 'highlight-1',
        priority: 1,
        endRow: 2,
        endColumn: 2,
        condition: { kind: CellHighlightKind.Duplicate },
        style: CellHighlightStyle.RedFill,
      },
    ]);
    sheetOne.fixedRows?.addItem(0, 2, true);
    sheetOne.rowHiddenOriginalSizes?.addItem(0, 3, 24);
    sheetOne.columnHiddenOriginalSizes?.addItem(0, 4, 100);
    sheetOne.cellMerges.setItem(0, 0, { endRow: 0, endColumn: 2 });

    const sheetTwo = createSheetState([2, 2]);
    sheetTwo.sheetData.addItem(0, 0, { type: CellType.String, value: 'second' });

    const workbook = createWorkbookDocumentState({
      id: 'book-1',
      metadata: { owner: 'tests' },
      sheets: [
        { id: 'sheet-2', name: 'Second', hidden: true, metadata: { role: 'data' } },
        { id: 'sheet-1', name: 'First', color: '#ff0000' },
      ],
      sheetStates: { 'sheet-1': sheetOne, 'sheet-2': sheetTwo },
    });

    const file = serializeWorkbookDocumentState(workbook);
    const restored = deserializeWorkbookDocumentState(JSON.parse(JSON.stringify(file)));
    const restoredOne = restored.sheetStates['sheet-1'];

    expect(file).toMatchObject({ format: 'searsuite.workbook' });
    expect(file.workbook.sheetStates['sheet-1'].modules.map((module) => module.key)).toEqual([
      'sheet.data',
      'sheet.rowSizes',
      'sheet.columnSizes',
      'sheet.rowHiddenOriginalSizes',
      'sheet.columnHiddenOriginalSizes',
      'sheet.cellAlignments',
      'sheet.cellVerticalAlignments',
      'sheet.cellFills',
      'sheet.cellHighlights',
      'sheet.dataValidations',
      'sheet.cellBorders',
      'sheet.duplicates',
      'sheet.cellFormats',
      'sheet.fixedRows',
      'sheet.cellMerges',
    ]);
    expect(restored.id).toBe('book-1');
    expect(restored.metadata).toEqual({ owner: 'tests' });
    expect(restored.sheets).toEqual([
      { id: 'sheet-2', name: 'Second', hidden: true, metadata: { role: 'data' } },
      { id: 'sheet-1', name: 'First', color: '#ff0000' },
    ]);
    expect(restoredOne.sheetData.getItem(0, 0)).toEqual({ type: CellType.String, value: 'hello' });
    expect(restoredOne.sheetData.getItem(1, 1)).toEqual({ type: CellType.Number, value: 42 });
    expect(restoredOne.cellFormats.getItem(1, 1)).toEqual({
      kind: 'number',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    expect(restoredOne.sheetData.getItem(2, 2)).toEqual({
      type: CellType.RichText,
      value: [{ type: 'paragraph', content: [{ type: 'text', text: 'rich', attrs: { textStyle: { bold: true } } }] }],
    });
    expect(restoredOne.sheetData.getItem(3, 3)).toEqual({ type: CellType.Formula, formula: '=Sheet2!A1+1' });
    expect(restoredOne.rowSizes.getDefaultValue()).toBe(24);
    expect(restoredOne.columnSizes.getDefaultValue()).toBe(100);
    expect(restoredOne.rowSizes.getItem(0, 1)).toBe(40);
    expect(restoredOne.columnSizes.getItem(0, 2)).toBe(120);
    expect(restoredOne.cellAlignments.getItem(0, 0)).toBe('left');
    expect(restoredOne.cellAlignments.getItem(1, 1)).toBe('right');
    expect(restoredOne.cellFills.getItem(1, 1)).toBe('#e6f0ff');
    expect(restoredOne.cellHighlights.getItem(1, 1)).toEqual([
      {
        id: 'highlight-1',
        priority: 1,
        endRow: 2,
        endColumn: 2,
        condition: { kind: CellHighlightKind.Duplicate },
        style: CellHighlightStyle.RedFill,
      },
    ]);
    expect(restoredOne.cellBorders?.getItem(1, 1)).toEqual({
      top: { color: '#256cfb', style: SheetBorderLineStyle.Double },
    });
    expect(restoredOne.cellVerticalAlignments.getItem(1, 1)).toBe('bottom');
    expect(restoredOne.fixedRows?.getItem(0, 2)).toBe(true);
    expect(restoredOne.rowHiddenOriginalSizes?.getItem(0, 3)).toBe(24);
    expect(restoredOne.columnHiddenOriginalSizes?.getItem(0, 4)).toBe(100);
    expect(restoredOne.cellMerges.getItem(0, 0)).toEqual({ endRow: 0, endColumn: 2 });
  });

  it('allows future Sheet state owners to add modules through registration', () => {
    const sheet = createSheetState([2, 2]);
    sheet.backgroundColors.addItem(0, 1, '#ffeeaa');
    const registry = createExtendedSheetRegistry();
    const workbook = createWorkbookDocumentState({
      id: 'book-1',
      sheets: [{ id: 'sheet-1', name: 'First' }],
      sheetStates: { 'sheet-1': sheet },
    });

    const file = serializeWorkbookDocumentState(workbook, { sheetRegistry: registry });
    const restored = deserializeWorkbookDocumentState<ExtendedSheetDocumentState>(file, { sheetRegistry: registry });

    expect(file.workbook.sheetStates['sheet-1'].modules.some((module) => module.key === 'sheet.backgroundColors')).toBe(
      true,
    );
    expect(restored.sheetStates['sheet-1'].backgroundColors.getItem(0, 1)).toBe('#ffeeaa');
  });

  it('throws a stable error for unsupported workbook formats', () => {
    const workbook = createWorkbookDocumentState({
      id: 'book-1',
      sheets: [{ id: 'sheet-1', name: 'First' }],
      sheetStates: { 'sheet-1': createSheetState([1, 1]) },
    });
    const file = { ...serializeWorkbookDocumentState(workbook), format: 'other.workbook' };

    expect(() => deserializeWorkbookDocumentState(file)).toThrow(ExportError);
    expect(() => deserializeWorkbookDocumentState(file)).toThrow('Unsupported workbook file format.');
    try {
      deserializeWorkbookDocumentState(file);
    } catch (error) {
      expect((error as ExportError).code).toBe(ExportErrorCode.invalidFormat);
    }
  });

  it('rejects sparse entries outside the declared matrix shape', () => {
    const workbook = createWorkbookDocumentState({
      id: 'book-1',
      sheets: [{ id: 'sheet-1', name: 'First' }],
      sheetStates: { 'sheet-1': createSheetState([1, 1]) },
    });
    const file = serializeWorkbookDocumentState(workbook);
    const dataModule = file.workbook.sheetStates['sheet-1'].modules.find((module) => module.key === 'sheet.data');
    if (!dataModule || typeof dataModule.payload !== 'object' || dataModule.payload === null) {
      throw new Error('Missing sheet data module.');
    }
    (dataModule.payload as { entries: unknown[] }).entries.push({
      row: 5,
      col: 0,
      value: { type: CellType.String, value: 'bad' },
    });

    expect(() => deserializeWorkbookDocumentState(file)).toThrow('Sparse matrix entry is outside the matrix shape.');
  });
});

function createSheetState(shape: [number, number]): ExtendedSheetDocumentState {
  const rowSizes = new RowShapeDimensionsCSRMatrix(void 0, [1, shape[0]]);
  const columnSizes = new ColumnShapeDimensionsCSRMatrix(void 0, [1, shape[1]]);
  rowSizes.setDefaultValue(24);
  columnSizes.setDefaultValue(100);
  return {
    sheetData: new SheetMatrix(void 0, shape),
    rowSizes,
    columnSizes,
    cellAlignments: new AlignmentMatrix(void 0, shape),
    cellVerticalAlignments: new VerticalAlignmentMatrix(void 0, shape),
    cellFills: new CellFillMatrix(void 0, shape),
    cellHighlights: new CellHighlightMatrix(void 0, shape),
    duplicates: new DuplicateMatrix(void 0, shape),
    cellFormats: new CellFormatMatrix(void 0, shape),
    fixedRows: new FixedRowMatrix(void 0, [1, shape[0]]),
    rowHiddenOriginalSizes: new CSRMatrix<number>(void 0, [1, shape[0]]),
    columnHiddenOriginalSizes: new CSRMatrix<number>(void 0, [1, shape[1]]),
    cellMerges: new CellMergeMatrix(void 0, shape),
    backgroundColors: new CSRMatrix<string>(void 0, shape),
  };
}

function createExtendedSheetRegistry(): DocumentStateCodecRegistry<ExtendedSheetDocumentState> {
  const registry =
    createDefaultSheetDocumentStateExportRegistry() as DocumentStateCodecRegistry<ExtendedSheetDocumentState>;
  registry.register({
    key: 'sheet.backgroundColors',
    serialize: (state) => ({
      shape: state.backgroundColors.shape,
      entries: collectBackgroundColorEntries(state.backgroundColors),
    }),
    deserialize: (payload) => ({
      backgroundColors: readBackgroundColors(payload),
    }),
  });
  return registry;
}

function collectBackgroundColorEntries(matrix: CSRMatrix<string>): Array<{ row: number; col: number; value: string }> {
  const entries: Array<{ row: number; col: number; value: string }> = [];
  matrix.forEachStored((value, row, col) => entries.push({ row, col, value }));
  return entries;
}

function readBackgroundColors(payload: unknown): CSRMatrix<string> {
  const record = payload as { shape: [number, number]; entries: Array<{ row: number; col: number; value: string }> };
  const matrix = new CSRMatrix<string>(void 0, record.shape);
  record.entries.forEach((entry) => matrix.addItem(entry.row, entry.col, entry.value));
  return matrix;
}
