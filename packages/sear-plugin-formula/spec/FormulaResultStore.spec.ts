import { FormulaResultStore } from '../src/FormulaResultStore';
import { CellFormulaValueConverterRegistry } from '../src/CellFormulaValueConverterRegistry';
import { CellType } from '@searsuite/sear-domain-cell-types';
import { cellKey } from '@searsuite/sear-domain-formula-engine-ts';
import { type Platform } from '@searsuite/sear-foundation-platform';

describe('FormulaResultStore', () => {
  let store: FormulaResultStore;
  let registry: CellFormulaValueConverterRegistry;

  beforeEach(() => {
    registry = new CellFormulaValueConverterRegistry({ warn: jest.fn() } as unknown as Platform);
    jest.spyOn(registry, 'toFormulaValue').mockReturnValue('mock-val');
    store = new FormulaResultStore(registry);
  });

  it('manages cache correctly', () => {
    store.set(123, 'val');
    expect(store.get(123)).toBe('val');
    expect(store.has(123)).toBe(true);

    store.delete(123);
    expect(store.has(123)).toBe(false);

    store.set(123, 'val');
    store.clear();
    expect(store.has(123)).toBe(false);
  });

  it('replaces hyperlink metadata when a formula is recalculated or removed', () => {
    const key = cellKey(0, 0);
    store.setFormulaResult(key, 'Open', { isCellInBounds: () => true });
    store.setRichResult(key, { kind: 'hyperlink', target: 'https://example.com/', label: 'Open' });
    expect(store.getRichAt(0, 0)).toEqual({
      kind: 'hyperlink', target: 'https://example.com/', label: 'Open',
    });

    store.setFormulaResult(key, 'Plain', { isCellInBounds: () => true });
    expect(store.getRichAt(0, 0)).toBeUndefined();
    store.setRichResult(key, { kind: 'hyperlink', target: 'https://example.com/next', label: 'Next' });
    store.delete(key);
    expect(store.getRichAt(0, 0)).toBeUndefined();
  });

  it('enumerates only derived spill cells inside a requested range', () => {
    store.setFormulaResult(cellKey(0, 0), [['same', 'same'], ['same', 'other']], {
      isCellInBounds: () => true,
      isCellOccupied: () => false,
    });
    const positions: Array<[number, number]> = [];
    store.forEachSpillInRange(0, 1, 1, 1, (row, column) => positions.push([row, column]));

    expect(positions).toEqual([[0, 1], [1, 1]]);
    expect(store.getAt(0, 1)).toBe('same');
    expect(store.isSpillCell(0, 0)).toBe(false);
    expect(store.isSpillCell(0, 1)).toBe(true);
    expect(store.isSpillCell(1, 1)).toBe(true);
    expect(store.isSpillCell(2, 2)).toBe(false);
  });

  it('reports WPS VALUE errors when an array cannot spill', () => {
    const key = cellKey(0, 0);
    for (const context of [
      { isCellInBounds: () => true, isCellOccupied: () => true },
      { isCellInBounds: (_row: number, col: number) => col < 1 },
    ]) {
      store.setFormulaResult(key, [[1, 2]], context);
      expect(store.get(key)).toEqual({ kind: 'error', code: '#VALUE!' });
      expect(store.isSpillCell(0, 1)).toBe(false);
    }
  });

  it('guards committed results and locks retained spill values', () => {
    let executing = false;
    store.enforceCommandBoundary(() => executing);
    const result = [[1, { kind: 'error' as const, code: '#N/A' as const }]];
    expect(() => store.set(cellKey(0, 0), 99)).toThrow('editor.commands.run');
    executing = true;
    store.setFormulaResult(cellKey(0, 0), result, { isCellInBounds: () => true });
    executing = false;
    expect(() => { result[0]![0] = 7; }).toThrow();
    expect(() => { (result[0]![1] as { code: string }).code = '#VALUE!'; }).toThrow();
    expect(() => store.delete(cellKey(0, 0))).toThrow('editor.commands.run');
    expect(store.getAt(0, 1)).toEqual({ kind: 'error', code: '#N/A' });
  });

  it('rejects result writes when a retained store has a forged command guard', () => {
    Object.assign(store, { assertCommandWrite: () => void 0 });
    store.enforceCommandBoundary(() => false);

    expect(() => store.set(cellKey(0, 0), 7)).toThrow('editor.commands.run');
    expect(store.get(cellKey(0, 0))).toBeUndefined();
  });

  describe('cellToFormulaValue', () => {
    it('returns 0 for null/undefined cell', () => {
      expect(store.cellToFormulaValue(0, 0, null)).toBe(0);
      expect(store.cellToFormulaValue(0, 0, undefined)).toBe(0);
    });

    it('returns 0 for formula cell that is not cached', () => {
      expect(store.cellToFormulaValue(0, 0, { type: CellType.Formula })).toBe(0);
    });

    it('returns cached value for formula cell', () => {
      store.set(cellKey(0, 0), 'cached-val');
      expect(store.cellToFormulaValue(0, 0, { type: CellType.Formula })).toBe('cached-val');
    });

    it('reads projected spill cells and the scalar value of an array anchor', () => {
      store.setFormulaResult(cellKey(0, 0), [[1, 2], [3, 4]], {
        isCellInBounds: () => true,
        isCellOccupied: () => false,
      });

      expect(store.cellToFormulaValue(0, 0, { type: CellType.Formula })).toBe(1);
      expect(store.cellToFormulaValue(0, 1, null)).toBe(2);
      expect(store.cellToFormulaValue(1, 1, null)).toBe(4);
      expect(store.cellToFormulaValue(2, 2, null)).toBe(0);
    });

    it('delegates to registry for other cell types', () => {
      expect(store.cellToFormulaValue(0, 0, { type: CellType.String })).toBe('mock-val');
      expect(registry.toFormulaValue).toHaveBeenCalledWith({ type: CellType.String });
    });
  });
});
