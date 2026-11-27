import { CellFormats, DefaultCellFormatLocale } from '@searsuite/sear-domain-cell-types';
import { readFormattedNumberCellColor } from '@searsuite/sear-assembly-sheet-kernel';

describe('readFormattedNumberCellColor', () => {
  it('BUG-099 uses the displayed negative-number color while ordinary values have none', () => {
    const format = CellFormats.excelCode('#,##0.00;[Red]-#,##0.00');
    expect(readFormattedNumberCellColor({ type: 'number', value: -12 }, format, DefaultCellFormatLocale)).toBe(
      '#ff0000',
    );
    expect(readFormattedNumberCellColor({ type: 'number', value: 12 }, format, DefaultCellFormatLocale)).toBeNull();
    expect(readFormattedNumberCellColor({ type: 'string', value: '-12' }, format, DefaultCellFormatLocale)).toBeNull();
  });
});
