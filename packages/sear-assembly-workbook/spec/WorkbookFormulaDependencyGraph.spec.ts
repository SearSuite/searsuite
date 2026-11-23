import { WorkbookFormulaDependencyGraph } from '../src';

describe('WorkbookFormulaDependencyGraph', () => {
  it('detaches registered and queried references and locks composite results', () => {
    const graph = new WorkbookFormulaDependencyGraph();
    const formulaCell = { sheetId: 'sheet-1', row: 0, col: 0 };
    const range = { sheetId: 'sheet-2', start: [0, 0] as [number, number], end: [1, 1] as [number, number] };
    graph.updateFormulaCell(formulaCell, [range]);
    range.start[0] = 9;
    const snapshot = graph.getDependencies(formulaCell);
    (snapshot[0] as unknown as { start: [number, number] }).start[0] = 8;
    expect(graph.getDependents({ sheetId: 'sheet-2', row: 0, col: 0 })).toEqual([formulaCell]);
    expect(graph.getDependencies(formulaCell)).toEqual([
      { sheetId: 'sheet-2', start: [0, 0], end: [1, 1] },
    ]);

    const result = [[1, 2]];
    graph.setFormulaResult(formulaCell, result);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
    expect(graph.getFormulaResult(formulaCell)).toBe(result);
  });
  it('marks references to deleted sheets as broken without removing the formula cell', () => {
    const graph = new WorkbookFormulaDependencyGraph();
    graph.updateFormulaCell({ sheetId: 'sheet-1', row: 0, col: 0 }, [{ sheetId: 'sheet-2', row: 0, col: 0 }]);

    graph.removeSheet('sheet-2');

    expect(graph.getFormulaCells()).toEqual([{ sheetId: 'sheet-1', row: 0, col: 0 }]);
    expect(graph.getBrokenReferences({ sheetId: 'sheet-1', row: 0, col: 0 })).toEqual([
      {
        kind: 'broken',
        reason: 'sheetDeleted',
        sheetId: 'sheet-2',
        reference: { sheetId: 'sheet-2', row: 0, col: 0 },
      },
    ]);
    expect(graph.getDependents({ sheetId: 'sheet-2', row: 0, col: 0 })).toEqual([]);
  });

  it('removes formula cells owned by deleted sheets', () => {
    const graph = new WorkbookFormulaDependencyGraph();
    graph.updateFormulaCell({ sheetId: 'sheet-1', row: 0, col: 0 }, [{ sheetId: 'sheet-2', row: 0, col: 0 }]);

    graph.removeSheet('sheet-1');

    expect(graph.getFormulaCells()).toEqual([]);
    expect(graph.size).toBe(0);
  });

  it('marks cross-sheet dependents dirty and clears stale cached results transitively', () => {
    const graph = new WorkbookFormulaDependencyGraph();
    graph.updateFormulaCell({ sheetId: 'sheet-1', row: 0, col: 0 }, [{ sheetId: 'sheet-2', row: 0, col: 0 }]);
    graph.updateFormulaCell({ sheetId: 'sheet-3', row: 0, col: 0 }, [{ sheetId: 'sheet-1', row: 0, col: 0 }]);
    graph.setFormulaResult({ sheetId: 'sheet-1', row: 0, col: 0 }, 2);
    graph.setFormulaResult({ sheetId: 'sheet-3', row: 0, col: 0 }, 3);

    expect(graph.markDirty([{ sheetId: 'sheet-2', row: 0, col: 0 }])).toEqual([
      { sheetId: 'sheet-1', row: 0, col: 0 },
      { sheetId: 'sheet-3', row: 0, col: 0 },
    ]);

    expect(graph.getDirtyFormulaCells()).toEqual([
      { sheetId: 'sheet-1', row: 0, col: 0 },
      { sheetId: 'sheet-3', row: 0, col: 0 },
    ]);
    expect(graph.getFormulaResult({ sheetId: 'sheet-1', row: 0, col: 0 })).toBeUndefined();
    expect(graph.getFormulaResult({ sheetId: 'sheet-3', row: 0, col: 0 })).toBeUndefined();
  });

  it('marks formulas that depend on a workbook range dirty when any cell inside the range changes', () => {
    const graph = new WorkbookFormulaDependencyGraph();
    graph.updateFormulaCell({ sheetId: 'sheet-1', row: 0, col: 0 }, [
      { sheetId: 'sheet-2', start: [0, 0], end: [1, 1] },
    ]);
    graph.setFormulaResult({ sheetId: 'sheet-1', row: 0, col: 0 }, 10);

    expect(graph.markDirty([{ sheetId: 'sheet-2', row: 1, col: 1 }])).toEqual([
      { sheetId: 'sheet-1', row: 0, col: 0 },
    ]);
    expect(graph.getFormulaResult({ sheetId: 'sheet-1', row: 0, col: 0 })).toBeUndefined();
  });
});
