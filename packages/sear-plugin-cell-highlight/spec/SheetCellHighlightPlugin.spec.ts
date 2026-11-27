import { MatrixOT, MatrixOTActionName, type MatrixOTOperation } from '@searsuite/sear-domain-ot';
import { SheetFormatTransferRegistry } from '@searsuite/sear-assembly-plugin';
import { SheetDisplayedValueChanges } from '@searsuite/sear-domain-cell-types';
import { createTransaction } from '@searsuite/sear-domain-transaction';
import { NodePlatform as HeadlessPlatform } from '@searsuite/sear-node-adapters';
import { SheetCellStyleRegistry } from '@searsuite/sear-domain-cell-types';
import {
  CellHighlightKind,
  CellHighlightMatrix,
  CellHighlightStyle,
  CellHighlightValueOperator,
  SheetCellHighlightPlugin,
  type CellHighlightRule,
} from '../src';
import { evaluateCellHighlight } from '../src/evaluateCellHighlight';

function rule(endRow: number, endColumn: number): CellHighlightRule {
  return {
    id: 'rule-1',
    priority: 1,
    endRow,
    endColumn,
    condition: { kind: CellHighlightKind.Value, operator: CellHighlightValueOperator.Greater, value: '5' },
    style: CellHighlightStyle.RedFill,
  };
}

describe('SheetCellHighlightPlugin', () => {
  const platform = new HeadlessPlatform();

  it('stores one sparse anchor for a range and clones its rules', () => {
    const matrix = new CellHighlightMatrix(void 0, [5, 5]);
    matrix.setItem(1, 1, [rule(3, 3)]);
    expect(matrix.getRules()).toHaveLength(1);
    expect(matrix.findRules(2, 2)).toHaveLength(1);
    expect(matrix.findRules(0, 2)).toHaveLength(0);
    const copy = matrix.clone();
    copy.setItem(1, 1, null);
    expect(matrix.findRules(2, 2)).toHaveLength(1);
  });

  it('re-evaluates a value rule without changing persisted rule state', () => {
    const matrix = new CellHighlightMatrix(void 0, [2, 2]);
    matrix.setItem(0, 0, [rule(1, 1)]);
    let value = 3;
    const plugin = new SheetCellHighlightPlugin(
      { cellHighlights: matrix },
      {
        readValue: () => value,
        forEachValueInRange: (_sr, _sc, _er, _ec, visit) => visit(value),
        readNumericValue: () => value,
        forEachNumericValueInRange: (_sr, _sc, _er, _ec, visit) => visit(value),
        createId: () => 'next',
        platform,
      },
    );
    expect(Reflect.get(plugin, 'occurrenceCounts')).toBeUndefined();
    expect(Reflect.get(plugin, 'rangeThresholds')).toBeUndefined();
    const registry = new SheetCellStyleRegistry();
    plugin.registerCellStyles(registry);
    expect(registry.read(1, 1)).toEqual({});
    value = 7;
    expect(registry.read(1, 1)).toEqual({ fill: '#FBC8CF', textColor: '#BD101E' });
    expect(matrix.getRules()).toHaveLength(1);
  });

  it('moves an anchored rule range with row insertion', () => {
    const matrix = new CellHighlightMatrix(void 0, [4, 4]);
    matrix.setItem(1, 1, [rule(2, 2)]);
    const plugin = new SheetCellHighlightPlugin(
      { cellHighlights: matrix },
      {
        readValue: () => null,
        forEachValueInRange: () => {},
        readNumericValue: () => null,
        forEachNumericValueInRange: () => {},
        createId: () => 'next',
        platform,
      },
    );
    const transaction = createTransaction({ key: 'sheet.data' });
    transaction.addOperation([{ p: [0], [MatrixOTActionName.RowInsert]: [] } as never]);
    plugin.apply(plugin.getState(), transaction);
    expect(matrix.getRules()).toEqual([{ row: 2, column: 1, rule: rule(3, 2) }]);
    expect(matrix.findRules(3, 2)).toHaveLength(1);
  });

  it('BUG-945 extends a rule when a row is inserted inside its range', () => {
    const matrix = new CellHighlightMatrix(void 0, [5, 4]);
    matrix.setItem(1, 1, [rule(2, 1)]);
    const plugin = new SheetCellHighlightPlugin(
      { cellHighlights: matrix },
      {
        readValue: () => 6000,
        forEachValueInRange: () => {},
        readNumericValue: () => 6000,
        forEachNumericValueInRange: () => {},
        createId: () => 'next',
        platform,
      },
    );
    const transaction = createTransaction({ key: 'sheet.data' });
    transaction.addOperation([{ p: [2], [MatrixOTActionName.RowInsert]: [] } as never]);
    plugin.apply(plugin.getState(), transaction);

    expect(matrix.getRules()).toEqual([{ row: 1, column: 1, rule: rule(3, 1) }]);
    const registry = new SheetCellStyleRegistry();
    plugin.registerCellStyles(registry);
    for (const rowIndex of [1, 2, 3]) {
      expect(registry.read(rowIndex, 1)).toEqual({ fill: '#FBC8CF', textColor: '#BD101E' });
    }
    expect(registry.read(4, 1)).toEqual({});
  });

  it('BUG-961 clears only the selected part of a highlight rule through format transfers', () => {
    const matrix = new CellHighlightMatrix(void 0, [4, 4]);
    matrix.setItem(1, 1, [rule(2, 1)]);
    const plugin = new SheetCellHighlightPlugin(
      { cellHighlights: matrix },
      {
        readValue: () => 10,
        forEachValueInRange: () => {},
        readNumericValue: () => 10,
        forEachNumericValueInRange: () => {},
        createId: () => 'fragment',
        platform,
      },
    );
    const formats = new SheetFormatTransferRegistry();
    plugin.registerFormatTransfers(formats);
    const plans = formats.clear({ start: [1, 1], end: [1, 1] });
    expect(plans).toHaveLength(1);
    expect(plans[0]?.target).toBe(plugin.key);
    MatrixOT.apply(matrix, plans[0]!.operations as MatrixOTOperation<CellHighlightRule[] | null>[]);
    expect(matrix.findRules(1, 1)).toHaveLength(0);
    expect(matrix.getRules()).toEqual([{ row: 2, column: 1, rule: { ...rule(2, 1), id: 'fragment' } }]);
    expect(formats.clear({ start: [1, 1], end: [1, 1] })).toHaveLength(0);
  });

  it('BUG-064 and BUG-960 clip copied rules and preserve target rules outside the destination', () => {
    const matrix = new CellHighlightMatrix(void 0, [4, 5]);
    matrix.setItem(1, 1, [rule(2, 1)]);
    matrix.setItem(1, 3, [{ ...rule(2, 3), id: 'target' }]);
    let nextId = 0;
    const plugin = new SheetCellHighlightPlugin(
      { cellHighlights: matrix },
      {
        readValue: () => 10,
        forEachValueInRange: () => {},
        readNumericValue: () => 10,
        forEachNumericValueInRange: () => {},
        createId: () => `copy-${++nextId}`,
        platform,
      },
    );
    const formats = new SheetFormatTransferRegistry();
    plugin.registerFormatTransfers(formats);
    const captured = formats.capturePortable({ start: [1, 1], end: [1, 1] });
    expect(captured).toHaveLength(1);
    const plans = formats.planPortable(captured, { start: [1, 3], end: [1, 3] });
    expect(plans).toHaveLength(1);
    MatrixOT.apply(matrix, plans[0]!.operations as MatrixOTOperation<CellHighlightRule[] | null>[]);

    expect(matrix.findRules(1, 1)).toHaveLength(1);
    expect(matrix.findRules(2, 1)).toHaveLength(1);
    expect(matrix.findRules(1, 3)).toHaveLength(1);
    expect(matrix.findRules(1, 3)[0]?.rule.endRow).toBe(1);
    expect(matrix.findRules(2, 3)).toHaveLength(1);
    expect(matrix.findRules(2, 3)[0]?.rule.id).not.toBe('target');
    expect(matrix.findRules(0, 3)).toHaveLength(0);
  });

  it('evaluates text, blank, error, duplicate and numeric conditions', () => {
    expect(
      evaluateCellHighlight({ kind: CellHighlightKind.Text, operator: 'contains', value: 'ABC' }, 'xabcx', platform),
    ).toBe(true);
    expect(evaluateCellHighlight({ kind: CellHighlightKind.Empty }, null, platform)).toBe(true);
    expect(evaluateCellHighlight({ kind: CellHighlightKind.Error }, '#REF!', platform)).toBe(false);
    expect(evaluateCellHighlight({ kind: CellHighlightKind.Error }, { kind: 'error', code: '#REF!' }, platform)).toBe(
      true,
    );
    expect(evaluateCellHighlight({ kind: CellHighlightKind.Duplicate }, 'same', platform, 2)).toBe(true);
    expect(evaluateCellHighlight({ kind: CellHighlightKind.Unique }, 'same', platform, 1)).toBe(true);
    expect(
      evaluateCellHighlight(
        { kind: CellHighlightKind.Value, operator: 'between', value: '2', secondValue: '4' },
        3,
        platform,
      ),
    ).toBe(true);
    expect(
      evaluateCellHighlight(
        { kind: CellHighlightKind.Value, operator: 'between', value: '2', secondValue: '4' },
        5,
        platform,
      ),
    ).toBe(false);
    expect(
      evaluateCellHighlight({ kind: CellHighlightKind.Text, operator: 'contains', value: 'STRASSE' }, 'straße', {
        toLowerCase: (value) => value.replace(/ß/g, 'ss').toLowerCase(),
      }),
    ).toBe(true);
  });

  it('BUG-850 recognizes Excel wildcards and escaped literals in text conditions', () => {
    const contains = (value: string) => ({ kind: CellHighlightKind.Text, operator: 'contains' as const, value });
    expect(evaluateCellHighlight(contains('a?c'), 'abc', platform)).toBe(true);
    expect(evaluateCellHighlight(contains('a?c'), 'axc', platform)).toBe(true);
    expect(evaluateCellHighlight(contains('a?c'), 'ac', platform)).toBe(false);
    expect(evaluateCellHighlight(contains('a~?c'), 'a?c', platform)).toBe(true);
    expect(evaluateCellHighlight(contains('a~?c'), 'abc', platform)).toBe(false);
    expect(evaluateCellHighlight({ ...contains('a?c'), operator: 'notContains' }, 'abc', platform)).toBe(false);
  });

  it('BUG-031 highlights formula errors without treating identical cell text as an error', () => {
    const matrix = new CellHighlightMatrix(void 0, [40, 10]);
    matrix.setItem(29, 3, [
      {
        ...rule(29, 4),
        condition: { kind: CellHighlightKind.Error },
      },
    ]);
    const formulaError = { kind: 'error', code: '#DIV/0!' };
    const plugin = new SheetCellHighlightPlugin(
      { cellHighlights: matrix },
      {
        readValue: (_row, column) => (column === 3 ? '#DIV/0!' : formulaError),
        forEachValueInRange: () => {},
        readNumericValue: () => null,
        forEachNumericValueInRange: () => {},
        createId: () => 'next',
        platform,
      },
    );
    const registry = new SheetCellStyleRegistry();
    plugin.registerCellStyles(registry);

    expect(registry.read(29, 3)).toEqual({});
    expect(registry.read(29, 4)).toEqual({ fill: '#FBC8CF', textColor: '#BD101E' });
    expect(evaluateCellHighlight({ kind: CellHighlightKind.NotError }, '#DIV/0!', platform)).toBe(true);
    expect(evaluateCellHighlight({ kind: CellHighlightKind.NotError }, formulaError, platform)).toBe(false);
  });

  it('BUG-478 ignores radix-prefixed cell text in numeric conditions', () => {
    const greaterThanTen = { kind: CellHighlightKind.Value, operator: CellHighlightValueOperator.Greater, value: '10' };
    expect(evaluateCellHighlight(greaterThanTen, '0x10', platform)).toBe(false);
    expect(evaluateCellHighlight(greaterThanTen, '0b10000', platform)).toBe(false);
    expect(evaluateCellHighlight(greaterThanTen, '16', platform)).toBe(true);
    expect(evaluateCellHighlight(greaterThanTen, 16, platform)).toBe(true);
    expect(evaluateCellHighlight(greaterThanTen, '1.6e1', platform)).toBe(true);
  });

  it('counts only supplied display values across a million-row rule', () => {
    const matrix = new CellHighlightMatrix(void 0, [1_000_000, 1]);
    matrix.setItem(0, 0, [
      {
        ...rule(999_999, 0),
        condition: { kind: CellHighlightKind.Duplicate },
      },
    ]);
    let visits = 0;
    const plugin = new SheetCellHighlightPlugin(
      { cellHighlights: matrix },
      {
        readValue: (row) => (row === 0 || row === 999_999 ? 'same' : null),
        forEachValueInRange: (_sr, _sc, _er, _ec, visit) => {
          visits += 2;
          visit('same');
          visit('same');
        },
        readNumericValue: () => null,
        forEachNumericValueInRange: () => {},
        createId: () => 'next',
        platform,
      },
    );
    const registry = new SheetCellStyleRegistry();
    plugin.registerCellStyles(registry);

    expect(registry.read(5, 0)).toEqual({});
    expect(visits).toBe(0);
    expect(registry.read(0, 0)).toEqual({ fill: '#FBC8CF', textColor: '#BD101E' });
    expect(visits).toBe(2);
    expect(registry.read(999_999, 0)).toEqual({ fill: '#FBC8CF', textColor: '#BD101E' });
    expect(visits).toBe(2);
  });

  it('rebuilds duplicate counts when derived display values change', () => {
    const matrix = new CellHighlightMatrix(void 0, [3, 1]);
    matrix.setItem(0, 0, [{ ...rule(1, 0), condition: { kind: CellHighlightKind.Duplicate } }]);
    let secondValue = 'other';
    let rangeReads = 0;
    const changes = new SheetDisplayedValueChanges(jest.fn());
    const plugin = new SheetCellHighlightPlugin(
      { cellHighlights: matrix },
      {
        readValue: () => 'same',
        forEachValueInRange: (_sr, _sc, _er, _ec, visit) => {
          rangeReads++;
          visit('same');
          visit(secondValue);
        },
        readNumericValue: () => null,
        forEachNumericValueInRange: () => {},
        createId: () => 'next',
        platform,
        displayedValueChanges: changes,
      },
    );
    const registry = new SheetCellStyleRegistry();
    plugin.registerCellStyles(registry);
    expect(registry.read(0, 0)).toEqual({});
    secondValue = 'same';
    changes.publish([{ row: 2, column: 0 }]);
    expect(registry.read(0, 0)).toEqual({});
    expect(rangeReads).toBe(1);
    changes.publish([{ row: 1, column: 0 }]);
    expect(registry.read(0, 0)).toEqual({ fill: '#FBC8CF', textColor: '#BD101E' });
    expect(rangeReads).toBe(2);
    plugin.dispose();
  });

  it('BUG-848 highlights wildcard-related duplicates and updates after editing', () => {
    const matrix = new CellHighlightMatrix(void 0, [3, 1]);
    matrix.setItem(0, 0, [{ ...rule(1, 0), condition: { kind: CellHighlightKind.Duplicate } }]);
    const values = ['*', 'foo'];
    const changes = new SheetDisplayedValueChanges(jest.fn());
    const plugin = new SheetCellHighlightPlugin(
      { cellHighlights: matrix },
      {
        readValue: (row) => values[row],
        forEachValueInRange: (_sr, _sc, _er, _ec, visit) => values.forEach(visit),
        readNumericValue: () => null,
        forEachNumericValueInRange: () => {},
        createId: () => 'next',
        platform,
        displayedValueChanges: changes,
      },
    );
    const registry = new SheetCellStyleRegistry();
    plugin.registerCellStyles(registry);
    const highlighted = { fill: '#FBC8CF', textColor: '#BD101E' };

    expect(registry.read(0, 0)).toEqual(highlighted);
    expect(registry.read(1, 0)).toEqual(highlighted);
    values[0] = '?';
    values[1] = 'a';
    changes.publish([
      { row: 0, column: 0 },
      { row: 1, column: 0 },
    ]);
    expect(registry.read(0, 0)).toEqual(highlighted);
    expect(registry.read(1, 0)).toEqual(highlighted);
    values[1] = 'ab';
    changes.publish([{ row: 1, column: 0 }]);
    expect(registry.read(0, 0)).toEqual({});
    expect(registry.read(1, 0)).toEqual({});
    values[0] = '*';
    values[1] = '*';
    changes.publish([
      { row: 0, column: 0 },
      { row: 1, column: 0 },
    ]);
    expect(registry.read(0, 0)).toEqual(highlighted);
    expect(registry.read(1, 0)).toEqual(highlighted);
    plugin.dispose();
  });

  it('caches ranked thresholds and invalidates them when a value in the rule changes', () => {
    const matrix = new CellHighlightMatrix(void 0, [4, 1]);
    matrix.setItem(0, 0, [{ ...rule(2, 0), condition: { kind: CellHighlightKind.Top, count: 1 } }]);
    const values = [8, 5, 3];
    let scans = 0;
    const changes = new SheetDisplayedValueChanges(jest.fn());
    const plugin = new SheetCellHighlightPlugin(
      { cellHighlights: matrix },
      {
        readValue: (row) => values[row] ?? null,
        forEachValueInRange: () => {},
        readNumericValue: (row) => values[row] ?? null,
        forEachNumericValueInRange: (_sr, _sc, _er, _ec, visit) => {
          scans++;
          values.forEach(visit);
        },
        createId: () => 'next',
        platform,
        displayedValueChanges: changes,
      },
    );
    const registry = new SheetCellStyleRegistry();
    plugin.registerCellStyles(registry);
    expect(registry.read(0, 0).fill).toBe('#FBC8CF');
    expect(registry.read(1, 0)).toEqual({});
    expect(scans).toBe(2);
    values[1] = 10;
    changes.publish([{ row: 3, column: 0 }]);
    expect(registry.read(0, 0).fill).toBe('#FBC8CF');
    expect(scans).toBe(2);
    changes.publish([{ row: 1, column: 0 }]);
    expect(registry.read(0, 0)).toEqual({});
    expect(registry.read(1, 0).fill).toBe('#FBC8CF');
    expect(scans).toBe(4);
    plugin.dispose();
  });

  it('compares numeric values against the average with optional equality', () => {
    const condition = { kind: CellHighlightKind.AboveAverage, includeEqual: true };
    expect(evaluateCellHighlight(condition, 5, platform, 0, 5)).toBe(true);
    expect(evaluateCellHighlight({ ...condition, includeEqual: false }, 5, platform, 0, 5)).toBe(false);
    expect(evaluateCellHighlight({ kind: CellHighlightKind.BelowAverage }, 3, platform, 0, 5)).toBe(true);
    expect(evaluateCellHighlight(condition, '9', platform, 0, 5)).toBe(false);
  });
});
