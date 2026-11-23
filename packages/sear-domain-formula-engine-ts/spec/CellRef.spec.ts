import { cellKey } from '../src/cellKey';
import { fromCellKey } from '../src/fromCellKey';
import { parseCellRef } from '../src/parseCellRef';
import { toCellRef } from '../src/toCellRef';

describe('CellRef', () => {
  describe('parseCellRef', () => {
    it('parses A1', () => {
      const result = parseCellRef('A1');
      expect(result).toEqual({ row: 0, col: 0, absRow: false, absCol: false });
    });

    it('parses $A$1 (absolute reference)', () => {
      const result = parseCellRef('$A$1');
      expect(result).toEqual({ row: 0, col: 0, absRow: true, absCol: true });
    });

    it('parses AA10', () => {
      const result = parseCellRef('AA10');
      expect(result).toEqual({ row: 9, col: 26, absRow: false, absCol: false });
    });

    it('parses A$1 (mixed: absolute row)', () => {
      const result = parseCellRef('A$1');
      expect(result).toEqual({ row: 0, col: 0, absRow: true, absCol: false });
    });

    it('parses $B2 (mixed: absolute col)', () => {
      const result = parseCellRef('$B2');
      expect(result).toEqual({ row: 1, col: 1, absRow: false, absCol: true });
    });

    it('parses Z1', () => {
      const result = parseCellRef('Z1');
      expect(result).toEqual({ row: 0, col: 25, absRow: false, absCol: false });
    });

    it('parses lowercase a1', () => {
      const result = parseCellRef('a1');
      expect(result).toEqual({ row: 0, col: 0, absRow: false, absCol: false });
    });
  });

  describe('toCellRef', () => {
    it('converts (0,0) to A1', () => {
      expect(toCellRef(0, 0)).toBe('A1');
    });

    it('converts (9,26) to AA10', () => {
      expect(toCellRef(9, 26)).toBe('AA10');
    });

    it('converts (0,25) to Z1', () => {
      expect(toCellRef(0, 25)).toBe('Z1');
    });

    it('includes absolute markers', () => {
      expect(toCellRef(0, 0, true, true)).toBe('$A$1');
      expect(toCellRef(0, 0, true, false)).toBe('A$1');
      expect(toCellRef(0, 0, false, true)).toBe('$A1');
    });

    it('round-trips with parseCellRef', () => {
      const refs = ['A1', 'Z1', 'AA10', '$B$2', 'A$1', '$C3'];
      for (const ref of refs) {
        const parsed = parseCellRef(ref);
        const rebuilt = toCellRef(parsed.row, parsed.col, parsed.absRow, parsed.absCol);
        expect(rebuilt).toBe(ref);
      }
    });
  });

  describe('cellKey / fromCellKey', () => {
    it('encodes and decodes (0,0)', () => {
      const key = cellKey(0, 0);
      expect(fromCellKey(key)).toEqual([0, 0]);
    });

    it('encodes and decodes (100, 50)', () => {
      const key = cellKey(100, 50);
      expect(fromCellKey(key)).toEqual([100, 50]);
    });

    it('encodes and decodes large coordinates', () => {
      const key = cellKey(1048575, 16383);
      expect(fromCellKey(key)).toEqual([1048575, 16383]);
    });

    it('produces unique keys for different coordinates', () => {
      const k1 = cellKey(0, 0);
      const k2 = cellKey(0, 1);
      const k3 = cellKey(1, 0);
      expect(k1).not.toBe(k2);
      expect(k1).not.toBe(k3);
      expect(k2).not.toBe(k3);
    });
  });
});
