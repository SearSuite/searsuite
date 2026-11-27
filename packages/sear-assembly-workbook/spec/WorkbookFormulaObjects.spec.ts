import { type SheetDocumentState } from '@searsuite/sear-assembly-sheet-state';
import { type WorkbookDocumentState } from '@searsuite/sear-domain-workbook';
import { WorkbookFormulaEvaluationRuntime } from '@searsuite/sear-assembly-workbook-kernel';
import { WorkbookFormulaObjectsMetadataKey } from '@searsuite/sear-assembly-workbook-kernel';

const state = {
  id: 'book',
  sheets: [
    { id: 'main', name: 'Main' },
    { id: 'data', name: 'Sales Data' },
    { id: 'jan', name: 'Jan' },
    { id: 'feb', name: 'Feb' },
    { id: 'mar', name: 'Mar' },
  ],
  sheetStates: {
    data: {
      sheetData: {
        getItem: (row: number, col: number) => (row === 0 && col === 1 ? { value: 'Amount' } : null),
      },
    },
  },
  metadata: {
    [WorkbookFormulaObjectsMetadataKey]: {
      names: { Rate: '=Main!$B$1' },
      tables: [{ name: 'Sales', sheet: 'Sales Data', range: 'A1:B3', headers: true }],
    },
  },
} as unknown as WorkbookDocumentState<SheetDocumentState>;

describe('workbook formula objects', () => {
  const runtime = new WorkbookFormulaEvaluationRuntime();
  const cell = { sheetId: 'main', row: 0, col: 0 };

  it('binds defined names to their referenced cells', () => {
    const compiled = runtime.compileFormula(cell, '=100*Rate', state);
    expect(compiled.dependencies).toEqual([{ sheetId: 'main', row: 0, col: 1 }]);
    expect(compiled.hasWorkbookReferences).toBe(true);
  });

  it('binds a table column with a spaced sheet name', () => {
    const compiled = runtime.compileFormula(cell, '=SUM(Sales[Amount])', state);
    expect(compiled.dependencies).toEqual([{ sheetId: 'data', start: [1, 1], end: [2, 1] }]);
  });

  it('binds structured table sections and qualified columns', () => {
    expect(runtime.compileFormula(cell, '=SUM(Sales[#All])', state).dependencies).toEqual([
      { sheetId: 'data', start: [0, 0], end: [2, 1] },
    ]);
    expect(runtime.compileFormula(cell, '=SUM(Sales[[#Headers],[Amount]])', state).dependencies).toEqual([
      { sheetId: 'data', start: [0, 1], end: [0, 1] },
    ]);
    expect(runtime.compileFormula(cell, '=SUM(Sales[[#Data],[Amount]])', state).dependencies).toEqual([
      { sheetId: 'data', start: [1, 1], end: [2, 1] },
    ]);
  });

  it('expands a three-dimensional reference in workbook sheet order', () => {
    const compiled = runtime.compileFormula(cell, '=SUM(Jan:Mar!B2)', state);
    expect(compiled.dependencies).toEqual([
      { sheetId: 'jan', row: 1, col: 1 },
      { sheetId: 'feb', row: 1, col: 1 },
      { sheetId: 'mar', row: 1, col: 1 },
    ]);
  });
});
