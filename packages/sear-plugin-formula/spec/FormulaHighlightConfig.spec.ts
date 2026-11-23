import {
  getFormulaReferenceColor,
  formulaReferenceHighlightConfig,
  FormulaReferenceColorPalette,
} from '../src/FormulaHighlightConfig';

describe('FormulaHighlightConfig', () => {
  it('returns default color if no colors provided', () => {
    const color = getFormulaReferenceColor(0);
    expect(color).toBe(Object.values(formulaReferenceHighlightConfig.referenceColors)[0]);
  });

  it('cycles colors using referenceIndex', () => {
    const length = Object.values(formulaReferenceHighlightConfig.referenceColors).length;
    expect(getFormulaReferenceColor(length)).toBe(getFormulaReferenceColor(0));
  });

  it('uses custom colors if provided', () => {
    const customColors: any = { myColor: '#FFFFFF' };
    expect(getFormulaReferenceColor(0, customColors)).toBe('#FFFFFF');
  });

  it('falls back to default colors if custom colors are empty', () => {
    const emptyColors: any = {};
    const color = getFormulaReferenceColor(0, emptyColors);
    expect(color).toBe(Object.values(formulaReferenceHighlightConfig.referenceColors)[0]);
  });
});
