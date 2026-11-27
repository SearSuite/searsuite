import {
  CellFormats,
  CellType,
  NumberCellCommitStrategy,
  formatCellNumber,
  interpretNumberInput,
} from '@searsuite/sear-domain-cell-types';

import { type CellDisplayTextProvider } from './CellDisplayTextRegistry';

import { CellTypeDefinition } from './CellTypeDefinition';

/** Built-in persisted cell type for finite numeric values. */
export class NumberCellTypeDefinition extends CellTypeDefinition {
  /** Stable persisted type identifier for number cells. */
  readonly type = CellType.Number;
  /** Creates the commit strategy for numeric input. */
  override createCommitStrategies() {
    return [new NumberCellCommitStrategy()];
  }
  /** Returns whether the stored value is a finite number. */
  override isStoredValue(cell: { value?: unknown }): boolean {
    return typeof cell.value === 'number' && Number.isFinite(cell.value);
  }
  /** Creates the display-text provider that applies numeric formatting. */
  override createDisplayTextProvider(): CellDisplayTextProvider {
    return {
      cellType: this.type,
      getDisplayText: function getNumberCellDisplayText(cell, context) {
        return typeof cell.value === 'number'
          ? formatCellNumber(cell.value, cell.format, context.cellFormatLocale)
          : '';
      },
    };
  }
  override createClipboardCodec() {
    return {
      cellType: this.type,
      encode: (cell: { value?: unknown }) => ({ value: cell.value }),
      decode: (data: unknown) => {
        if (!data || typeof data !== 'object') return null;
        const stored = data as { value?: unknown };
        return typeof stored.value === 'number' && Number.isFinite(stored.value)
          ? {
              type: this.type,
              value: stored.value,
            }
          : null;
      },
      toPlainText: (cell: { value?: unknown }) => (typeof cell.value === 'number' ? String(cell.value) : ''),
      decodePlainText: (text: string) => {
        const parsed = interpretNumberInput(text, CellFormats.general);
        return parsed && !parsed.format ? { type: this.type, value: parsed.value } : null;
      },
    };
  }
}
