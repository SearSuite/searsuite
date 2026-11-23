import { FormulaDateSystem, type IFormulaDateSystemProvider } from '@searsuite/sear-domain-formula-engine';
import { parseSheetFilterDate } from '../src/sheet/runtimePlugin/filter/parseSheetFilterDate';

describe('Sheet filter date adapter', () => {
  it('converts ISO dates to the configured workbook serial system', () => {
    const excel1900 = { getDateSystem: () => FormulaDateSystem.Excel1900 } as IFormulaDateSystemProvider;
    const excel1904 = { getDateSystem: () => FormulaDateSystem.Excel1904 } as IFormulaDateSystemProvider;
    expect(parseSheetFilterDate('1900-03-01', excel1900)).toBe(61);
    expect(parseSheetFilterDate('1904-01-01', excel1904)).toBe(0);
    expect(parseSheetFilterDate(61.75, excel1900)).toBe(61);
    expect(parseSheetFilterDate('2024-02-30', excel1900)).toBeNull();
  });
});
