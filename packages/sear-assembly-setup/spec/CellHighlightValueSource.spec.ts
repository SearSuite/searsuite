import { CellType, type CellClipboardCodecRegistry } from '@searsuite/sear-domain-cell-types';
import { type IFormulaResultProvider } from '@searsuite/sear-domain-formula-engine';
import { SheetMatrix } from '@searsuite/sear-domain-sheet';
import { createCellHighlightValueSource } from '@searsuite/sear-assembly-sheet-kernel';

describe('Cell highlight display value range', () => {
  it('combines stored cells and formula spills without counting formula anchors twice', () => {
    const matrix = new SheetMatrix(void 0, [2, 2]);
    matrix.addItem(0, 0, { type: CellType.String, value: 'same' });
    matrix.addItem(0, 1, { type: CellType.Formula, formula: '=A1' });
    const codecs = { toPlainText: (cell: { value?: unknown }) => cell.value } as unknown as CellClipboardCodecRegistry;
    const formulaResults: IFormulaResultProvider = {
      getFormulaResult: (row, column) => ((row === 0 && column === 1) || (row === 1 && column === 0) ? 'same' : void 0),
      forEachFormulaResultInRange: (_sr, _sc, _er, _ec, visit) => {
        visit(0, 1);
        visit(1, 0);
      },
    };
    const source = createCellHighlightValueSource(
      () => matrix,
      () => codecs,
      () => formulaResults,
    );

    const values: unknown[] = [];
    source.forEachValueInRange(0, 0, 1, 1, (value) => values.push(value));
    expect(values).toEqual(['same', 'same', 'same']);
  });

  it('reads only typed numeric cells and numeric formula projections for statistics', () => {
    const matrix = new SheetMatrix(void 0, [3, 2]);
    matrix.addItem(0, 0, { type: CellType.Number, value: 12 });
    matrix.addItem(0, 1, { type: CellType.String, value: '99' });
    matrix.addItem(1, 0, { type: CellType.Formula, formula: '=6*2' });
    const formulaResults: IFormulaResultProvider = {
      getFormulaResult: (row, column) => (row === 1 && column === 0 ? 12 : row === 2 && column === 0 ? 5 : void 0),
      forEachFormulaResultInRange: (_sr, _sc, _er, _ec, visit) => {
        visit(1, 0);
        visit(2, 0);
      },
    };
    const source = createCellHighlightValueSource(
      () => matrix,
      () => null,
      () => formulaResults,
    );
    const numbers: number[] = [];
    source.forEachNumericValueInRange(0, 0, 2, 1, (value) => numbers.push(value));
    expect(numbers).toEqual([12, 12, 5]);
    expect(source.readNumericValue(0, 1)).toBeNull();
    expect(source.readNumericValue(2, 0)).toBe(5);
  });

  it('BUG-859 reads the visible top-left number of an array formula anchor', () => {
    const matrix = new SheetMatrix(void 0, [4, 2]);
    matrix.addItem(1, 1, { type: CellType.Formula, formula: '=SEQUENCE(3,1,10)' });
    const formulaResults: IFormulaResultProvider = {
      getFormulaResult: (row, column) =>
        column !== 1 ? void 0 : row === 1 ? [[10], [11], [12]] : row === 2 ? 11 : row === 3 ? 12 : void 0,
      forEachFormulaResultInRange: (_sr, _sc, _er, _ec, visit) => {
        visit(2, 1);
        visit(3, 1);
      },
    };
    const source = createCellHighlightValueSource(
      () => matrix,
      () => null,
      () => formulaResults,
    );
    expect(source.readValue(1, 1)).toBe(10);
    expect(source.readNumericValue(1, 1)).toBe(10);
    const numbers: number[] = [];
    source.forEachNumericValueInRange(1, 1, 3, 1, (value) => numbers.push(value));
    expect(numbers).toEqual([10, 11, 12]);
  });
});
