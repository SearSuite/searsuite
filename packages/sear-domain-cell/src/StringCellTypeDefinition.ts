import {
  CellType,
  DefaultStringCellCommitStrategy,
  TextCellCommitStrategy,
  formatCellText,
} from '@searsuite/sear-domain-cell-types';
import { StringCell } from '@searsuite/sear-render-registry';

import { type CellDisplayTextProvider } from './CellDisplayTextRegistry';
import { defineCellRenderer } from './CellRendererDefinition';
import { CellTypeDefinition } from './CellTypeDefinition';

/** Built-in persisted cell type for plain text values. */
export class StringCellTypeDefinition extends CellTypeDefinition {
  /** Stable persisted type identifier for string cells. */
  readonly type = CellType.String;
  /** Creates commit strategies for explicit text and default string commits. */
  override createCommitStrategies() {
    return [new TextCellCommitStrategy(), new DefaultStringCellCommitStrategy()];
  }
  /** Returns whether the stored value is a string cell value. */
  override isStoredValue(cell: { value?: unknown }): boolean {
    return typeof cell.value === 'string';
  }
  /** Creates the display-text provider for plain string values. */
  override createDisplayTextProvider(): CellDisplayTextProvider {
    return {
      cellType: this.type,
      getDisplayText: function getStringCellDisplayText(cell, context) {
        return typeof cell.value === 'string'
          ? formatCellText(cell.value, cell.format, context.cellFormatLocale)
          : String(cell.value ?? '');
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
        return typeof stored.value === 'string'
          ? {
              type: this.type,
              value: stored.value,
            }
          : null;
      },
      toPlainText: (cell: { value?: unknown }) => (typeof cell.value === 'string' ? cell.value : ''),
      decodePlainText: (text: string) => (text.length === 0 ? null : { type: this.type, value: text }),
    };
  }
  /** Creates the renderer definition for plain string cells. */
  override createRenderer() {
    return defineCellRenderer(this.type, StringCell);
  }
}
