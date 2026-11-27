import { FormulaParser } from '@searsuite/sear-domain-formula-engine-ts';
import { MatrixOTActionName } from '@searsuite/sear-domain-ot';
import { WorkbookFormulaReferenceShifter } from '@searsuite/sear-assembly-workbook-kernel';

describe('WorkbookFormulaReferenceShifter', () => {
  const parser = new FormulaParser();
  const shifter = new WorkbookFormulaReferenceShifter();
  const bindings = new Map([
    ['Two', 'sheet-2'],
    ['Other', 'sheet-3'],
  ]);

  it('shifts workbook cell and range references bound to the changed sheet', () => {
    const ast = parser.parse('=SUM(Two!A1:B1)+Other!A1');

    const result = shifter.shiftReferences({
      ast,
      sheetBindings: bindings,
      changedSheetId: 'sheet-2',
      changes: [{ type: MatrixOTActionName.RowInsert, index: 0, count: 1 }],
    });

    expect(result.changed).toBe(true);
    expect(result.brokenReferences).toEqual([]);
    expect(result.ast).toMatchObject({
      kind: 'binary',
      left: {
        kind: 'call',
        args: [{ kind: 'workbookRange', sheetName: 'Two', start: [1, 0], end: [1, 1] }],
      },
      right: { kind: 'workbookCell', sheetName: 'Other', row: 0, col: 0 },
    });
  });

  it('shifts workbook references in invocation callees and arguments', () => {
    const ast = parser.parse('=F(x,x+Two!A1)(Two!B1)');

    const result = shifter.shiftReferences({
      ast,
      sheetBindings: bindings,
      changedSheetId: 'sheet-2',
      changes: [{ type: MatrixOTActionName.RowInsert, index: 0, count: 1 }],
    });

    expect(result.changed).toBe(true);
    expect(result.ast).toMatchObject({
      kind: 'invoke',
      callee: { kind: 'call', args: [{ kind: 'name' }, { kind: 'binary', right: { row: 1, col: 0 } }] },
      args: [{ kind: 'workbookCell', row: 1, col: 1 }],
    });
  });

  it('records a broken reference when a referenced row is deleted', () => {
    const ast = parser.parse('=Two!A2');

    const result = shifter.shiftReferences({
      ast,
      sheetBindings: bindings,
      changedSheetId: 'sheet-2',
      changes: [{ type: MatrixOTActionName.RowDelete, index: 1, count: 1 }],
    });

    expect(result.changed).toBe(true);
    expect(result.brokenReferences).toEqual([{ sheetId: 'sheet-2', row: 1, col: 0 }]);
    expect(result.ast).toMatchObject({ kind: 'workbookCell', sheetName: 'Two', row: -1, col: -1 });
  });

  it('leaves workbook references for other sheets untouched', () => {
    const ast = parser.parse('=Other!A1');

    const result = shifter.shiftReferences({
      ast,
      sheetBindings: bindings,
      changedSheetId: 'sheet-2',
      changes: [{ type: MatrixOTActionName.ColInsert, index: 0, count: 1 }],
    });

    expect(result.changed).toBe(false);
    expect(result.ast).toBe(ast);
    expect(result.brokenReferences).toEqual([]);
  });

  it('swaps workbook cell references and normalizes workbook ranges for move changes', () => {
    const ast = parser.parse('=Two!A1+SUM(Two!A1:B2)');

    const result = shifter.shiftReferences({
      ast,
      sheetBindings: bindings,
      changedSheetId: 'sheet-2',
      changes: [
        { type: MatrixOTActionName.RowMove, fromIndex: 0, toIndex: 2 },
        { type: MatrixOTActionName.ColMove, fromIndex: 0, toIndex: 2 },
      ],
    });

    expect(result.changed).toBe(true);
    expect(result.brokenReferences).toEqual([]);
    expect(result.ast).toMatchObject({
      kind: 'binary',
      left: { kind: 'workbookCell', row: 2, col: 2 },
      right: { kind: 'call', args: [{ kind: 'workbookRange', start: [1, 1], end: [2, 2] }] },
    });
  });
});
