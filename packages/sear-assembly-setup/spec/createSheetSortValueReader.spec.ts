import { CellClipboardCodecRegistry, CellType, type CellMatrixElement } from '@searsuite/sear-domain-cell-types';
import { createFormulaError, FormulaErrorCode, type IFormulaResultProvider } from '@searsuite/sear-domain-formula-engine';
import { CSRMatrix } from '@searsuite/sear-domain-matrix';
import { createSheetSortValueReader } from '../src/sheet/runtimePlugin/sort/createSheetSortValueReader';

describe('createSheetSortValueReader', () => {
  it('BUG-708/709 reads a formula error by its displayed code, not its source text', () => {
    const cells = new CSRMatrix<CellMatrixElement>(undefined, [2, 1]);
    cells.addItem(0, 0, { type: CellType.Formula, formula: '=1/0' });
    cells.addItem(1, 0, { type: CellType.Formula, formula: '=0/0' });
    const codecs = new CellClipboardCodecRegistry();
    const plainText = jest.spyOn(codecs, 'toPlainText');
    const results: IFormulaResultProvider = {
      getFormulaResult: () => createFormulaError(FormulaErrorCode.DivisionByZero),
    };
    const read = createSheetSortValueReader(() => cells, () => codecs, () => results);

    expect([read(0, 0), read(1, 0)]).toEqual(['#DIV/0!', '#DIV/0!']);
    expect(plainText).not.toHaveBeenCalled();
  });
});
