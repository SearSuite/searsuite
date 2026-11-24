import { DependencyGraph } from '../src/DependencyGraph';
import { cellKey } from '../src/cellKey';
import { type Dependency } from '@searsuite/sear-domain-formula-engine';
import { FormulaNodeKind, StructureChangeAxis, shiftStructureCoordinate, type StructureChange } from '@searsuite/sear-domain-formula-engine';
import { MatrixOTActionName } from '@searsuite/sear-domain-ot';

describe('DependencyGraph', () => {
  let graph: DependencyGraph;

  beforeEach(() => {
    graph = new DependencyGraph();
  });

  it('rejects dependency writes when a retained graph has a forged command guard', () => {
    Object.assign(graph, { assertCommandWrite: () => void 0 });
    graph.enforceCommandBoundary(() => false);

    expect(() => graph.updateCell(cellKey(0, 0), [])).toThrow('editor.commands.run');
    expect(graph.size).toBe(0);
    const retained = graph as unknown as Record<string, unknown>;
    expect(retained['addCellRevDep']).toBeUndefined();
    expect(retained['rebuildDirtyDepCounts']).toBeUndefined();
  });

  describe('updateCell / removeCell', () => {
    it('registers formula with cell dependency', () => {
      const formulaKey = cellKey(0, 3); // D1
      const deps: Dependency[] = [{ kind: 'cell', row: 0, col: 0 }]; // A1
      graph.updateCell(formulaKey, deps);
      expect(graph.size).toBe(1);
      expect(graph.getFormulaKeys()).toEqual([formulaKey]);
    });

    it('removes formula', () => {
      const formulaKey = cellKey(0, 3);
      graph.updateCell(formulaKey, [{ kind: 'cell', row: 0, col: 0 }]);
      graph.removeCell(formulaKey);
      expect(graph.size).toBe(0);
    });

    it('updates formula (replaces old deps)', () => {
      const formulaKey = cellKey(0, 3);
      graph.updateCell(formulaKey, [{ kind: 'cell', row: 0, col: 0 }]);
      graph.updateCell(formulaKey, [{ kind: 'cell', row: 1, col: 0 }]); // A2
      expect(graph.size).toBe(1);
    });

    it('returns defensive dependency snapshots for formula status readers', () => {
      const formulaKey = cellKey(0, 3);
      const deps: Dependency[] = [{ kind: FormulaNodeKind.Range, start: [0, 0], end: [1, 1] }];
      graph.updateCell(formulaKey, deps);

      const snapshot = graph.getDependencies(formulaKey);
      expect(snapshot).toEqual(deps);

      const mutableRange = snapshot[0] as { start: [number, number] };
      mutableRange.start[0] = 99;

      expect(graph.getDependencies(formulaKey)).toEqual(deps);
      expect(graph.getDependencies(cellKey(9, 9))).toEqual([]);

      graph.updateCell(formulaKey, [{ kind: FormulaNodeKind.Cell, row: 2, col: 3 }]);
      expect(graph.getDependencies(formulaKey)).toEqual([{ kind: FormulaNodeKind.Cell, row: 2, col: 3 }]);
    });

    it('does not retain mutable dependency input', () => {
      const formulaKey = cellKey(0, 3);
      const deps: Dependency[] = [{ kind: FormulaNodeKind.Range, start: [0, 0], end: [1, 1] }];
      graph.updateCell(formulaKey, deps);
      (deps[0] as { start: [number, number] }).start[0] = 10;
      deps.push({ kind: FormulaNodeKind.Cell, row: 9, col: 9 });

      expect(graph.getDependencies(formulaKey)).toEqual([
        { kind: FormulaNodeKind.Range, start: [0, 0], end: [1, 1] },
      ]);
      expect(graph.getDependents(cellKey(0, 0))).toContain(formulaKey);
    });
  });

  describe('getDependents', () => {
    it('finds formula that depends on a cell', () => {
      const formulaKey = cellKey(0, 3); // D1 = A1
      graph.updateCell(formulaKey, [{ kind: 'cell', row: 0, col: 0 }]);

      const dependents = graph.getDependents(cellKey(0, 0)); // A1
      expect(dependents).toContain(formulaKey);
    });

    it('finds formula that depends on a range', () => {
      const formulaKey = cellKey(3, 0); // A4 = SUM(A1:C3)
      graph.updateCell(formulaKey, [
        {
          kind: 'range',
          start: [0, 0],
          end: [2, 2],
        },
      ]);

      // Query A2 (row 1, col 0) — within range
      const dependents = graph.getDependents(cellKey(1, 0));
      expect(dependents).toContain(formulaKey);

      // Query D1 (row 0, col 3) — outside range
      const noDependents = graph.getDependents(cellKey(0, 3));
      expect(noDependents).not.toContain(formulaKey);
    });

    it('finds multiple dependents', () => {
      const f1 = cellKey(0, 3); // D1 = A1
      const f2 = cellKey(0, 4); // E1 = A1 + B1
      graph.updateCell(f1, [{ kind: 'cell', row: 0, col: 0 }]);
      graph.updateCell(f2, [
        { kind: 'cell', row: 0, col: 0 },
        { kind: 'cell', row: 0, col: 1 },
      ]);

      const dependents = graph.getDependents(cellKey(0, 0));
      expect(dependents).toContain(f1);
      expect(dependents).toContain(f2);
    });

    it('returns empty for cell with no dependents', () => {
      const dependents = graph.getDependents(cellKey(99, 99));
      expect(dependents).toEqual([]);
    });

    it('indexes large, overflow, whole-column, and whole-row dependencies', () => {
      const columnIndexed = cellKey(50, 10);
      const overflow = cellKey(51, 10);
      const columns = cellKey(52, 10);
      const rows = cellKey(53, 10);
      // Large range > 100 cells to hit columnRanges (101 cells, col span 3)
      graph.updateCell(columnIndexed, [{ kind: FormulaNodeKind.Range, start: [0, 2], end: [100, 4] }]);
      // Overflow range (col span > 1000)
      graph.updateCell(overflow, [{ kind: FormulaNodeKind.Range, start: [0, 0], end: [1, 1001] }]);
      graph.updateCell(columns, [{ kind: FormulaNodeKind.ColumnRange, startCol: 6, endCol: 8 }]);
      graph.updateCell(rows, [{ kind: FormulaNodeKind.RowRange, startRow: 7, endRow: 9 }]);

      expect(graph.getDependents(cellKey(10, 3))).toContain(columnIndexed);
      expect(graph.getDependents(cellKey(1, 1001))).toContain(overflow);
      expect(graph.getDependents(cellKey(3, 7))).toContain(columns);
      expect(graph.getDependents(cellKey(8, 99))).toContain(rows);

      // Add another large range to test multiple entries in binary search
      const anotherCol = cellKey(60, 10);
      graph.updateCell(anotherCol, [{ kind: FormulaNodeKind.Range, start: [50, 2], end: [150, 4] }]);

      // Add a third large range BEFORE anotherCol to hit binary search 'else' branch (hi = mid)
      const earlierCol = cellKey(70, 10);
      graph.updateCell(earlierCol, [{ kind: FormulaNodeKind.Range, start: [10, 2], end: [110, 4] }]);

      expect(graph.getDependents(cellKey(60, 3))).toContain(anotherCol);
      // Query before startRow to hit the 'else' branch in binary search
      expect(graph.getDependents(cellKey(40, 3))).not.toContain(anotherCol);

      graph.removeCell(columnIndexed);
      graph.removeCell(overflow);
      graph.removeCell(columns);
      graph.removeCell(rows);
      graph.removeCell(anotherCol);

      expect(graph.getDependents(cellKey(10, 3))).not.toContain(columnIndexed);
      expect(graph.getDependents(cellKey(1, 1001))).not.toContain(overflow);
    });

    it('finds formulas inside indexed ranges without including adjacent rows', () => {
      const formulaKey = cellKey(80, 80);
      graph.updateCell(formulaKey, [{ kind: FormulaNodeKind.Range, start: [10, 6], end: [110, 6] }]);
      expect(graph.getDependents(cellKey(10, 6))).toContain(formulaKey);
      expect(graph.getDependents(cellKey(110, 6))).toContain(formulaKey);
      expect(graph.getDependents(cellKey(9, 6))).not.toContain(formulaKey);
      expect(graph.getDependents(cellKey(111, 6))).not.toContain(formulaKey);
    });
  });

  describe('dirty flag system', () => {
    it('markDirty marks affected formulas', () => {
      // Setup: D1 = A1, E1 = D1 (chain)
      const d1 = cellKey(0, 3);
      const e1 = cellKey(0, 4);
      graph.updateCell(d1, [{ kind: 'cell', row: 0, col: 0 }]); // D1 depends on A1
      graph.updateCell(e1, [{ kind: 'cell', row: 0, col: 3 }]); // E1 depends on D1

      // A1 changes
      graph.markDirty([cellKey(0, 0)]);

      expect(graph.pendingCount).toBe(2); // D1 and E1 are dirty
      expect(graph.isDirty(d1)).toBe(true);
      expect(graph.isDirty(cellKey(9, 9))).toBe(false);
    });

    it('waits for every dirty formula in one rectangular range', () => {
      const a1 = cellKey(0, 0);
      const a2 = cellKey(1, 0);
      const consumer = cellKey(0, 2);
      graph.updateCell(a1, [{ kind: FormulaNodeKind.Cell, row: 10, col: 0 }]);
      graph.updateCell(a2, [{ kind: FormulaNodeKind.Cell, row: 10, col: 1 }]);
      graph.updateCell(consumer, [{ kind: FormulaNodeKind.Range, start: [0, 0], end: [1, 0] }]);

      graph.markDirty([a1, a2]);

      expect(graph.getNextReadyBatch(new Set(), 100)).not.toContain(consumer);
      graph.markClean(a1);
      expect(graph.getNextReadyBatch(new Set(), 100)).not.toContain(consumer);
      graph.markClean(a2);
      expect(graph.getNextReadyBatch(new Set(), 100)).toContain(consumer);
    });

    it('counts a dirty predecessor once when cell and range dependencies overlap', () => {
      const predecessor = cellKey(0, 0);
      const consumer = cellKey(0, 2);
      graph.updateCell(predecessor, [{ kind: FormulaNodeKind.Cell, row: 10, col: 0 }]);
      graph.updateCell(consumer, [
        { kind: FormulaNodeKind.Cell, row: 0, col: 0 },
        { kind: FormulaNodeKind.Range, start: [0, 0], end: [0, 0] },
      ]);

      graph.markDirty([predecessor]);

      expect(graph.getNextReadyBatch(new Set(), 100)).not.toContain(consumer);
      graph.markClean(predecessor);
      expect(graph.getNextReadyBatch(new Set(), 100)).toContain(consumer);
    });

    it('deduplicates overlapping whole-row and whole-column dependencies', () => {
      const a1 = cellKey(0, 0);
      const b2 = cellKey(1, 1);
      const consumer = cellKey(3, 3);
      graph.updateCell(a1, [{ kind: FormulaNodeKind.Cell, row: 10, col: 0 }]);
      graph.updateCell(b2, [{ kind: FormulaNodeKind.Cell, row: 10, col: 1 }]);
      graph.updateCell(consumer, [
        { kind: FormulaNodeKind.ColumnRange, startCol: 0, endCol: 1 },
        { kind: FormulaNodeKind.RowRange, startRow: 0, endRow: 1 },
      ]);

      graph.markDirty([a1, b2]);

      graph.markClean(a1);
      expect(graph.getNextReadyBatch(new Set(), 100)).not.toContain(consumer);
      graph.markClean(b2);
      expect(graph.getNextReadyBatch(new Set(), 100)).toContain(consumer);
    });

    it('rebuilds predecessor counts after propagation regardless of changed key order', () => {
      const a1 = cellKey(0, 0);
      const a2 = cellKey(1, 0);
      const consumer = cellKey(0, 2);
      graph.updateCell(a1, [{ kind: FormulaNodeKind.Cell, row: 10, col: 0 }]);
      graph.updateCell(a2, [{ kind: FormulaNodeKind.Cell, row: 10, col: 1 }]);
      graph.updateCell(consumer, [{ kind: FormulaNodeKind.Range, start: [0, 0], end: [1, 0] }]);

      graph.markDirty([consumer, a1, a2]);

      graph.markClean(a1);
      expect(graph.getNextReadyBatch(new Set(), 100)).not.toContain(consumer);
      graph.markClean(a2);
      expect(graph.getNextReadyBatch(new Set(), 100)).toContain(consumer);
    });

    it('getNextReadyBatch returns formulas with all deps clean', () => {
      const d1 = cellKey(0, 3);
      const e1 = cellKey(0, 4);
      graph.updateCell(d1, [{ kind: 'cell', row: 0, col: 0 }]);
      graph.updateCell(e1, [{ kind: 'cell', row: 0, col: 3 }]);

      graph.markDirty([cellKey(0, 0)]);

      const viewport = new Set<number>();
      const ready = graph.getNextReadyBatch(viewport, 100);

      // Only D1 is ready (E1 depends on D1 which is still dirty)
      expect(ready).toContain(d1);
      expect(ready).not.toContain(e1);
    });

    it('markClean unlocks downstream formulas', () => {
      const d1 = cellKey(0, 3);
      const e1 = cellKey(0, 4);
      graph.updateCell(d1, [{ kind: 'cell', row: 0, col: 0 }]);
      graph.updateCell(e1, [{ kind: 'cell', row: 0, col: 3 }]);

      graph.markDirty([cellKey(0, 0)]);

      // Evaluate D1
      const ready1 = graph.getNextReadyBatch(new Set(), 100);
      for (const key of ready1) {
        graph.markClean(key);
      }

      // Now E1 should be ready
      const ready2 = graph.getNextReadyBatch(new Set(), 100);
      expect(ready2).toContain(e1);
    });

    it('viewport priority: returns viewport formulas first', () => {
      const f1 = cellKey(0, 3); // D1
      const f2 = cellKey(100, 3); // D101 (far away)
      graph.updateCell(f1, [{ kind: 'cell', row: 0, col: 0 }]);
      graph.updateCell(f2, [{ kind: 'cell', row: 0, col: 0 }]);

      graph.markDirty([cellKey(0, 0)]);

      // Viewport contains f1 only
      const viewport = new Set([f1]);
      const ready = graph.getNextReadyBatch(viewport, 100);

      // f1 should come before f2
      expect(ready[0]).toBe(f1);
      expect(ready[1]).toBe(f2);
    });

    it('pendingCount decreases as formulas are cleaned', () => {
      const d1 = cellKey(0, 3);
      graph.updateCell(d1, [{ kind: 'cell', row: 0, col: 0 }]);

      graph.markDirty([cellKey(0, 0)]);
      expect(graph.pendingCount).toBe(1);

      graph.markClean(d1);
      expect(graph.pendingCount).toBe(0);
    });
  });

  describe('cycle detection', () => {
    it('detects direct cycle: A1=B1, B1=A1', () => {
      const a1 = cellKey(0, 0);
      const b1 = cellKey(0, 1);

      // A1 depends on B1, B1 depends on A1
      graph.updateCell(a1, [{ kind: 'cell', row: 0, col: 1 }]);
      graph.updateCell(b1, [{ kind: 'cell', row: 0, col: 0 }]);

      // Trigger cycle detection
      graph.markDirty([a1]);

      const cycleKeys = graph.getLastCycleKeys();
      expect(cycleKeys.length).toBeGreaterThan(0);
      expect(cycleKeys).toContain(a1);
      expect(cycleKeys).toContain(b1);
    });

    it('leaves formulas downstream of a cycle ready for calculation', () => {
      const a1 = cellKey(0, 0);
      const b1 = cellKey(0, 1);
      const c1 = cellKey(0, 2);
      graph.updateCell(a1, [{ kind: 'cell', row: 0, col: 0 }]);
      graph.updateCell(b1, [{ kind: 'cell', row: 0, col: 0 }]);
      graph.updateCell(c1, [{ kind: 'cell', row: 0, col: 1 }]);

      graph.markDirty([a1]);
      expect(graph.getLastCycleKeys()).toEqual([a1]);
      graph.markClean(a1);
      expect(graph.getNextReadyBatch(new Set(), 10)).toEqual([b1]);
      graph.markClean(b1);
      expect(graph.getNextReadyBatch(new Set(), 10)).toEqual([c1]);
    });

    it('no cycle in normal dependency chain', () => {
      const a1 = cellKey(0, 0);
      const b1 = cellKey(0, 1);
      const c1 = cellKey(0, 2);

      graph.updateCell(c1, [{ kind: 'cell', row: 0, col: 1 }]); // C1 = B1
      graph.updateCell(b1, [{ kind: 'cell', row: 0, col: 0 }]); // B1 = A1

      graph.markDirty([a1]);

      expect(graph.getLastCycleKeys()).toEqual([]);
    });
  });

  describe('clear', () => {
    it('clears all data', () => {
      graph.updateCell(cellKey(0, 0), [{ kind: 'cell', row: 1, col: 0 }]);
      graph.updateCell(cellKey(0, 1), [{ kind: 'cell', row: 1, col: 0 }]);
      graph.markDirty([cellKey(1, 0)]);

      graph.clear();

      expect(graph.size).toBe(0);
      expect(graph.pendingCount).toBe(0);
      expect(graph.getDependents(cellKey(1, 0))).toEqual([]);
    });
  });

  describe('structure changes', () => {
    it('shifts cell, range, column, and row dependencies after insertions and deletions', () => {
      const formula = cellKey(0, 10);
      graph.updateCell(formula, [
        { kind: FormulaNodeKind.Cell, row: 3, col: 3 },
        { kind: FormulaNodeKind.Range, start: [4, 4], end: [5, 5] },
        { kind: FormulaNodeKind.ColumnRange, startCol: 6, endCol: 7 },
        { kind: FormulaNodeKind.RowRange, startRow: 8, endRow: 9 },
      ]);

      graph.onStructureChanged([
        { type: MatrixOTActionName.RowInsert, index: 3, count: 2 },
        { type: MatrixOTActionName.ColInsert, index: 3, count: 1 },
      ]);

      expect(graph.getDependents(cellKey(5, 4))).toContain(formula);
      expect(graph.getDependents(cellKey(10, 99))).toContain(formula);
      expect(graph.getDependents(cellKey(1, 7))).toContain(formula);

      graph.onStructureChanged([
        { type: MatrixOTActionName.RowDelete, index: 5, count: 1 },
        { type: MatrixOTActionName.ColDelete, index: 4, count: 1 },
      ]);
      expect(graph.size).toBe(1);

      // Delete covering entire reference to trigger -1
      graph.onStructureChanged([
        { type: MatrixOTActionName.RowDelete, index: 0, count: 20 },
        { type: MatrixOTActionName.ColDelete, index: 0, count: 20 },
      ]);
      expect(graph.size).toBe(1);

      // Structure change that does not affect the formula (no change branch)
      const noChangeFormula = cellKey(50, 50);
      graph.updateCell(noChangeFormula, [
        { kind: FormulaNodeKind.Cell, row: 10, col: 10 },
        { kind: FormulaNodeKind.Range, start: [20, 20], end: [30, 30] },
        { kind: FormulaNodeKind.ColumnRange, startCol: 40, endCol: 45 },
        { kind: FormulaNodeKind.RowRange, startRow: 40, endRow: 45 },
      ]);
      graph.onStructureChanged([
        { type: MatrixOTActionName.RowInsert, index: 100, count: 1 },
        { type: MatrixOTActionName.ColInsert, index: 100, count: 1 },
      ]);
      expect(graph.size).toBe(2);
    });

    it('rebases cell and normalized range dependencies through row and column swaps', () => {
      const g = new DependencyGraph();
      g.updateCell(cellKey(0, 1), [{ kind: FormulaNodeKind.Cell, row: 0, col: 0 }]);
      g.onStructureChanged([{ type: MatrixOTActionName.RowMove, fromIndex: 0, toIndex: 2 }]);
      expect(g.getDependents(cellKey(2, 0))).toContain(cellKey(0, 1));

      const g2 = new DependencyGraph();
      const formula = cellKey(0, 10);
      g2.updateCell(formula, [{ kind: FormulaNodeKind.ColumnRange, startCol: 0, endCol: 1 }]);
      g2.onStructureChanged([{ type: MatrixOTActionName.ColMove, fromIndex: 0, toIndex: 2 }]);
      expect(g2.getDependents(cellKey(0, 1))).toContain(formula);
      expect(g2.getDependents(cellKey(0, 2))).toContain(formula);

      const g3 = new DependencyGraph();
      g3.updateCell(formula, [{ kind: FormulaNodeKind.RowRange, startRow: 0, endRow: 1 }]);
      g3.onStructureChanged([{ type: MatrixOTActionName.RowMove, fromIndex: 0, toIndex: 2 }]);
      expect(g3.getDependents(cellKey(1, 0))).toContain(formula);
      expect(g3.getDependents(cellKey(2, 0))).toContain(formula);
    });

    it('covers shiftColumn and shiftRow delete branches for both retained and removed indices', () => {
      const changesColDelete: StructureChange[] = [{ type: MatrixOTActionName.ColDelete, index: 3, count: 2 }];
      expect(shiftStructureCoordinate({ coordinate: 10, axis: StructureChangeAxis.Col, changes: changesColDelete }).value).toBe(8);
      expect(shiftStructureCoordinate({ coordinate: 3, axis: StructureChangeAxis.Col, changes: changesColDelete }).value).toBe(-1);

      const changesRowDelete: StructureChange[] = [{ type: MatrixOTActionName.RowDelete, index: 4, count: 3 }];
      expect(shiftStructureCoordinate({ coordinate: 10, axis: StructureChangeAxis.Row, changes: changesRowDelete }).value).toBe(7);
      expect(shiftStructureCoordinate({ coordinate: 4, axis: StructureChangeAxis.Row, changes: changesRowDelete }).value).toBe(-1);
    });

    it('covers shiftColumn and shiftRow delete non-overlap branch (value before delete window)', () => {
      const changesColDelete: StructureChange[] = [{ type: MatrixOTActionName.ColDelete, index: 5, count: 2 }];
      const changesRowDelete: StructureChange[] = [{ type: MatrixOTActionName.RowDelete, index: 7, count: 3 }];

      expect(shiftStructureCoordinate({ coordinate: 1, axis: StructureChangeAxis.Col, changes: changesColDelete }).value).toBe(1);
      expect(shiftStructureCoordinate({ coordinate: 2, axis: StructureChangeAxis.Row, changes: changesRowDelete }).value).toBe(2);
    });

  });
});
