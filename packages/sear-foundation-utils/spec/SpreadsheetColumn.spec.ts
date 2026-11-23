import { columnIndexToLabel, columnLabelToIndex } from '../src';

describe('spreadsheet column utilities', () => {
  it('converts labels to zero-based indexes', () => {
    expect(columnLabelToIndex('A')).toBe(0);
    expect(columnLabelToIndex('Z')).toBe(25);
    expect(columnLabelToIndex('AA')).toBe(26);
    expect(columnLabelToIndex('XFD')).toBe(16383);
    expect(columnLabelToIndex('aa')).toBe(26);
  });

  it('converts zero-based indexes to labels', () => {
    expect(columnIndexToLabel(0)).toBe('A');
    expect(columnIndexToLabel(25)).toBe('Z');
    expect(columnIndexToLabel(26)).toBe('AA');
    expect(columnIndexToLabel(16383)).toBe('XFD');
  });
});
