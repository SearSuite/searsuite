/** @jest-environment node */

import { createHeadlessEditor, createHeadlessWorkbookEditor, type HeadlessWorkbookEditor } from '../src';
import {
  ActivateWorkbookSheetCommand,
  WorkbookStructureMoveError,
  WorkbookFormulaPlugin,
} from '@searsuite/sear-assembly-workbook';
import { MoveRowsCommand } from '@searsuite/sear-assembly-commands';
import { UndoSheetCommand, RedoSheetCommand } from '@searsuite/sear-plugin-history';
import { createWorkbookDocumentState } from '@searsuite/sear-domain-workbook';
import { GetFormulaCellStatusCommand, waitForFormulaIdle } from '@searsuite/sear-plugin-formula';
import { SheetMatrix } from '@searsuite/sear-assembly-core';
import { AlignmentMatrix, VerticalAlignmentMatrix } from '@searsuite/sear-plugin-alignment';
import { CellFillMatrix } from '@searsuite/sear-plugin-cell-fill';
import { CellHighlightMatrix } from '@searsuite/sear-plugin-cell-highlight';
import { DuplicateMatrix } from '@searsuite/sear-plugin-duplicate';
import { CellFormatMatrix } from '@searsuite/sear-plugin-cell-format';
import { CellMergeMatrix } from '@searsuite/sear-plugin-cell-merge';
import { CellType } from '@searsuite/sear-domain-cell-types';
import { FormulaDateSystem } from '@searsuite/sear-domain-formula-engine';
import { ColumnShapeDimensionsCSRMatrix, CSRMatrix, RowShapeDimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import type { SheetDocumentState } from '@searsuite/sear-assembly-setup';

function createSheetState(
  cells: Array<[number, number, unknown]>,
  shape: [number, number] = [6, 6],
): SheetDocumentState {
  const sheetData = new SheetMatrix(void 0, shape);
  for (const [row, col, value] of cells) sheetData.addItem(row, col, value as never);

  const rowSizes = new RowShapeDimensionsCSRMatrix(void 0, [1, shape[0]]);
  const columnSizes = new ColumnShapeDimensionsCSRMatrix(void 0, [1, shape[1]]);
  rowSizes.setDefaultValue(24);
  columnSizes.setDefaultValue(100);

  return {
    sheetData,
    rowSizes,
    columnSizes,
    cellAlignments: new AlignmentMatrix(void 0, shape),
    cellVerticalAlignments: new VerticalAlignmentMatrix(void 0, shape),
    cellFills: new CellFillMatrix(void 0, shape),
    cellHighlights: new CellHighlightMatrix(void 0, shape),
    duplicates: new DuplicateMatrix(void 0, shape),
    cellFormats: new CellFormatMatrix(void 0, shape),
    rowHiddenOriginalSizes: new CSRMatrix<number>(void 0, [1, shape[0]]),
    columnHiddenOriginalSizes: new CSRMatrix<number>(void 0, [1, shape[1]]),
    cellMerges: new CellMergeMatrix(void 0, shape),
  };
}

function formulaStatus(editor: { commands: { run: Function } }, row: number, col: number) {
  return editor.commands.run(GetFormulaCellStatusCommand, { row, col }).status;
}

describe('headless formula and workbook runtime', () => {
  it('uses per-workbook iteration settings for circular formulas', async () => {
    const makeWorkbook = (id: string, enabled: boolean) => createHeadlessWorkbookEditor({
      documentState: createWorkbookDocumentState<SheetDocumentState>({
        id,
        sheets: [{ id: 'main', name: 'Main' }],
        sheetStates: { main: createSheetState([
          [0, 0, { type: CellType.Formula, formula: '=A1/2+1' }],
        ], [2, 2]) },
      }),
      iteration: { enabled, maxIterations: 100, maxChange: 1e-9 },
    });
    const iterative = makeWorkbook('iterative', true);
    const ordinary = makeWorkbook('ordinary', false);
    try {
      const iterativeSheet = iterative.sheets.getActiveEditor();
      const ordinarySheet = ordinary.sheets.getActiveEditor();
      await Promise.all([waitForFormulaIdle(iterativeSheet.commands), waitForFormulaIdle(ordinarySheet.commands)]);
      expect(formulaStatus(iterativeSheet, 0, 0).result).toBeCloseTo(2, 8);
      expect(formulaStatus(ordinarySheet, 0, 0).result).toEqual({ kind: 'error', code: '#REF!' });
    } finally {
      ordinary.destroy();
      iterative.destroy();
    }
  });

  it('keeps workbook date systems isolated', async () => {
    const createBook = (id: string, dateSystem?: FormulaDateSystem) => createHeadlessWorkbookEditor({
      documentState: createWorkbookDocumentState<SheetDocumentState>({
        id,
        sheets: [{ id: 'main', name: 'Main' }],
        sheetStates: { main: createSheetState([[0, 0, { type: CellType.Formula, formula: '=DATE(1904,2,29)' }]]) },
      }),
      ...(dateSystem === undefined ? {} : { dateSystem }),
    });
    const ordinary = createBook('date-1900');
    const alternate = createBook('date-1904', FormulaDateSystem.Excel1904);
    try {
      const ordinarySheet = ordinary.sheets.getActiveEditor();
      const alternateSheet = alternate.sheets.getActiveEditor();
      await Promise.all([waitForFormulaIdle(ordinarySheet.commands), waitForFormulaIdle(alternateSheet.commands)]);
      expect(formulaStatus(ordinarySheet, 0, 0).result).toBe(1521);
      expect(formulaStatus(alternateSheet, 0, 0).result).toBe(59);
    } finally {
      alternate.destroy();
      ordinary.destroy();
    }
  });

  it('reports the workbook result for a cross-sheet formula', async () => {
    const documentState = createWorkbookDocumentState<SheetDocumentState>({
      id: 'cross-sheet-status',
      sheets: [{ id: 'north', name: 'North' }, { id: 'summary', name: 'Summary' }],
      sheetStates: {
        north: createSheetState([[0, 0, { type: CellType.Number, value: 19 }]], [2, 2]),
        summary: createSheetState([[0, 0, { type: CellType.Formula, formula: '=North!A1+23' }]], [2, 2]),
      },
    });
    const workbook = createHeadlessWorkbookEditor({ documentState, plugins: [WorkbookFormulaPlugin] });
    try {
      workbook.commands.run(ActivateWorkbookSheetCommand, { sheetId: 'summary' });
      const editor = workbook.sheets.getActiveEditor();
      await waitForFormulaIdle(editor.commands);
      expect(formulaStatus(editor, 0, 0).result).toBe(42);
    } finally {
      workbook.destroy();
    }
  });

  it('keeps formula results correct when inverse reference updates precede row swaps', async () => {
    const documentState = createWorkbookDocumentState<SheetDocumentState>({
      id: 'axis-move-book',
      sheets: [{ id: 'sheet-1', name: 'Inputs' }],
      sheetStates: {
        'sheet-1': createSheetState(
          [
            [0, 0, { type: CellType.Number, value: 7 }],
            [1, 0, { type: CellType.Number, value: 9 }],
            [1, 1, { type: CellType.Formula, formula: '=$A$1+A2' }],
          ],
          [4, 4],
        ),
      },
    });
    const workbook = createHeadlessWorkbookEditor({ documentState, plugins: [WorkbookFormulaPlugin] });
    try {
      const editor = workbook.sheets.getActiveEditor();
      editor.commands.run(MoveRowsCommand, { index: 0, count: 2, before: 4 });
      await waitForFormulaIdle(editor.commands);
      expect(formulaStatus(editor, 3, 1).result).toBe(16);
      editor.commands.run(UndoSheetCommand, undefined);
      await waitForFormulaIdle(editor.commands);
      expect(formulaStatus(editor, 1, 1).result).toBe(16);
      editor.commands.run(RedoSheetCommand, undefined);
      await waitForFormulaIdle(editor.commands);
      expect(formulaStatus(editor, 3, 1).result).toBe(16);
    } finally {
      workbook.destroy();
    }
  });
  it('rejects an affected cross-sheet qualified dependent before mutating rows', () => {
    const documentState = createWorkbookDocumentState<SheetDocumentState>({
      id: 'qualified-axis-book',
      sheets: [
        { id: 'sheet-1', name: 'Inputs' },
        { id: 'sheet-2', name: 'Summary' },
      ],
      sheetStates: {
        'sheet-1': createSheetState([[0, 0, { type: CellType.Number, value: 7 }]], [4, 4]),
        'sheet-2': createSheetState([[0, 0, { type: CellType.Formula, formula: '=Inputs!A1' }]], [4, 4]),
      },
    });
    const workbook = createHeadlessWorkbookEditor({ documentState, plugins: [WorkbookFormulaPlugin] });
    try {
      expect(() => workbook.sheets.getActiveEditor().commands.run(MoveRowsCommand, { index: 0, before: 4 })).toThrow(
        WorkbookStructureMoveError,
      );
    } finally {
      workbook.destroy();
    }
  });
  it('evaluates a multi-level SUM/COUNT dependency graph in Node', async () => {
    const editor = createHeadlessEditor({
      sheetState: createSheetState([
        [0, 0, { type: CellType.Number, value: 10 }],
        [1, 0, { type: CellType.Number, value: 20 }],
        [2, 0, { type: CellType.Number, value: 30 }],
        [0, 1, { type: CellType.Formula, formula: '=SUM(A1:A3)' }],
        [1, 1, { type: CellType.Formula, formula: '=COUNT(A1:A3)' }],
        [2, 1, { type: CellType.Formula, formula: '=SUM(B1:B2,COUNT(A1:A3))' }],
        [3, 1, { type: CellType.Formula, formula: '=SUM(A1:A3,COUNT(A1:A3),B1)' }],
      ]),
    });

    try {
      await waitForFormulaIdle(editor.commands);
      expect(formulaStatus(editor, 0, 1).result).toBe(60);
      expect(formulaStatus(editor, 1, 1).result).toBe(3);
      expect(formulaStatus(editor, 2, 1).result).toBe(66);
      expect(formulaStatus(editor, 3, 1).result).toBe(123);
      expect(formulaStatus(editor, 2, 1).dependencies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'range', start: [0, 1], end: [1, 1] }),
          expect.objectContaining({ kind: 'range', start: [0, 0], end: [2, 0] }),
        ]),
      );
    } finally {
      editor.destroy();
    }
  });

  it('evaluates Excel-style escaped double quotes in Node', async () => {
    const editor = createHeadlessEditor({
      sheetState: createSheetState([[0, 0, { type: CellType.Formula, formula: '="a""b"' }]], [1, 1]),
    });

    try {
      await waitForFormulaIdle(editor.commands);
      expect(formulaStatus(editor, 0, 0).result).toBe('a"b');
    } finally {
      editor.destroy();
    }
  });

  it('reports removed custom formulas as unknown in Node', async () => {
    const editor = createHeadlessEditor({
      sheetState: createSheetState([[0, 0, { type: CellType.Formula, formula: '=LAMBDA(x,x+1)(3)' }]], [1, 1]),
    });

    try {
      await waitForFormulaIdle(editor.commands);
      expect(formulaStatus(editor, 0, 0).result).toEqual({ kind: 'error', code: '#NAME?' });
    } finally {
      editor.destroy();
    }
  });

  it('evaluates scientific notation in Node', async () => {
    const editor = createHeadlessEditor({
      sheetState: createSheetState([[0, 0, { type: CellType.Formula, formula: '=NOT(-1e-12)' }]], [1, 1]),
    });

    try {
      await waitForFormulaIdle(editor.commands);
      expect(formulaStatus(editor, 0, 0).result).toBe(false);
    } finally {
      editor.destroy();
    }
  });

  it('returns DIV/0 for zero raised to a negative power in Node', async () => {
    const editor = createHeadlessEditor({
      sheetState: createSheetState([[0, 0, { type: CellType.Formula, formula: '=POWER(0,-1)' }]], [1, 1]),
    });

    try {
      await waitForFormulaIdle(editor.commands);
      const status = formulaStatus(editor, 0, 0);
      expect(status.result).toEqual({ kind: 'error', code: '#DIV/0!' });
      expect(status.errorCode).toBe('#DIV/0!');
    } finally {
      editor.destroy();
    }
  });

  it('counts zero-length text and truly blank cells with COUNTBLANK in Node', async () => {
    const editor = createHeadlessEditor({
      sheetState: createSheetState(
        [
          [0, 0, { type: CellType.Number, value: 0 }],
          [1, 0, { type: CellType.String, value: '' }],
          [0, 1, { type: CellType.Formula, formula: '=COUNTBLANK(A1:A3)' }],
        ],
        [3, 2],
      ),
    });

    try {
      await waitForFormulaIdle(editor.commands);
      const status = formulaStatus(editor, 0, 1);
      expect(status.result).toBe(2);
      expect(status.errorCode).toBeUndefined();
    } finally {
      editor.destroy();
    }
  });

  it('returns NAME for an undefined name passed to SHEET in Node', async () => {
    const editor = createHeadlessEditor({
      sheetState: createSheetState([[0, 0, { type: CellType.Formula, formula: '=SHEET(Hi_Temps)' }]], [1, 1]),
    });

    try {
      await waitForFormulaIdle(editor.commands);
      const status = formulaStatus(editor, 0, 0);
      expect(status.result).toEqual({ kind: 'error', code: '#NAME?' });
      expect(status.errorCode).toBe('#NAME?');
    } finally {
      editor.destroy();
    }
  });

  it('ignores text and truly blank cells when averaging a range in Node', async () => {
    const editor = createHeadlessEditor({
      sheetState: createSheetState(
        [
          [0, 0, { type: CellType.String, value: 'x' }],
          [999, 701, { type: CellType.Formula, formula: '=AVERAGE(A1:A2)' }],
        ],
        [1000, 702],
      ),
    });

    try {
      await waitForFormulaIdle(editor.commands);
      const status = formulaStatus(editor, 999, 701);
      expect(status.result).toEqual({ kind: 'error', code: '#DIV/0!' });
      expect(status.errorCode).toBe('#DIV/0!');
    } finally {
      editor.destroy();
    }
  });

  it('propagates formula errors through a headless SUM dependency', async () => {
    const editor = createHeadlessEditor({
      sheetState: createSheetState(
        [
          [0, 0, { type: CellType.Number, value: 10 }],
          [1, 0, { type: CellType.Number, value: 'bad' }],
          [0, 1, { type: CellType.Formula, formula: '=SUM(A1:A2)' }],
        ],
        [2, 2],
      ),
    });

    try {
      await waitForFormulaIdle(editor.commands);
      expect(formulaStatus(editor, 0, 1).errorCode).toBe('#VALUE!');
      expect(formulaStatus(editor, 0, 1).dirty).toBe(false);
    } finally {
      editor.destroy();
    }
  });

  it('evaluates a complex conditional, aggregate, and lookup chain in Node', async () => {
    const editor = createHeadlessEditor({
      sheetState: createSheetState(
        [
          [0, 0, { type: CellType.Number, value: 5 }],
          [1, 0, { type: CellType.Number, value: 15 }],
          [2, 0, { type: CellType.Number, value: 25 }],
          [3, 0, { type: CellType.Number, value: 35 }],
          [0, 1, { type: CellType.Number, value: 50 }],
          [1, 1, { type: CellType.Number, value: 150 }],
          [2, 1, { type: CellType.Number, value: 250 }],
          [3, 1, { type: CellType.Number, value: 350 }],
          [0, 2, { type: CellType.Formula, formula: '=AVERAGE(A1:A4)' }],
          [1, 2, { type: CellType.Formula, formula: '=SUMIF(A1:A4,">10",B1:B4)' }],
          [2, 2, { type: CellType.Formula, formula: '=IFERROR(VLOOKUP(25,A1:B4,2,FALSE),0)' }],
          [3, 2, { type: CellType.Formula, formula: '=IF(C2>0,C1+C3,1/0)' }],
        ],
        [4, 3],
      ),
    });

    try {
      await waitForFormulaIdle(editor.commands);
      expect(formulaStatus(editor, 0, 2).result).toBe(20);
      expect(formulaStatus(editor, 1, 2).result).toBe(750);
      expect(formulaStatus(editor, 2, 2).result).toBe(250);
      expect(formulaStatus(editor, 3, 2).result).toBe(270);
    } finally {
      editor.destroy();
    }
  });

  it('mounts and switches a workbook using Node-safe headless editors', async () => {
    const documentState = createWorkbookDocumentState<SheetDocumentState>({
      id: 'headless-book',
      sheets: [
        { id: 'sheet-1', name: 'Inputs' },
        { id: 'sheet-2', name: 'Summary' },
      ],
      sheetStates: {
        'sheet-1': createSheetState([[0, 0, { type: CellType.Number, value: 7 }]], [2, 2]),
        'sheet-2': createSheetState(
          [
            [0, 0, { type: CellType.Number, value: 2 }],
            [1, 0, { type: CellType.Number, value: 3 }],
            [0, 1, { type: CellType.Formula, formula: '=SUM(A1:A2)' }],
          ],
          [2, 2],
        ),
      },
    });

    const editor = createHeadlessWorkbookEditor({ documentState });
    try {
      expect(editor.sheets.getActiveId()).toBe('sheet-1');
      await waitForFormulaIdle(editor.sheets.getActiveEditor().commands);
      editor.commands.run(ActivateWorkbookSheetCommand, { sheetId: 'sheet-2' });
      await waitForFormulaIdle(editor.sheets.getActiveEditor().commands);
      expect(editor.sheets.getActiveId()).toBe('sheet-2');
      expect(formulaStatus(editor.sheets.getActiveEditor(), 0, 1).result).toBe(5);
      expect(editor.sheets.getEditor('sheet-1')).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it('accepts workbook configuration through createHeadlessEditor', () => {
    const documentState = createWorkbookDocumentState<SheetDocumentState>({
      id: 'overload-book',
      sheets: [{ id: 'sheet-1', name: 'Only sheet' }],
      sheetStates: { 'sheet-1': createSheetState([], [1, 1]) },
    });
    const editor = createHeadlessEditor({ documentState }) as HeadlessWorkbookEditor;
    expect(editor.sheets.getActiveId()).toBe('sheet-1');
    editor.destroy();
  });
});
