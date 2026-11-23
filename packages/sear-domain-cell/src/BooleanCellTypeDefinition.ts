import { BooleanCellCommitStrategy, CellType } from '@searsuite/sear-domain-cell-types';
import { BooleanCell } from '@searsuite/sear-render-registry';
import { type CellDisplayTextProvider } from './CellDisplayTextRegistry';
import { defineCellRenderer } from './CellRendererDefinition';
import { CellTypeDefinition } from './CellTypeDefinition';

/** Built-in persisted logical value with display and clipboard support. */
export class BooleanCellTypeDefinition extends CellTypeDefinition {
  readonly type = CellType.Boolean;

  override createCommitStrategies() {
    return [new BooleanCellCommitStrategy()];
  }

  override isStoredValue(cell: { value?: unknown }): boolean {
    return typeof cell.value === 'boolean';
  }

  override createDisplayTextProvider(): CellDisplayTextProvider {
    return {
      cellType: this.type,
      getDisplayText: (cell) => typeof cell.value === 'boolean' ? (cell.value ? 'TRUE' : 'FALSE') : '',
    };
  }

  override createClipboardCodec() {
    return {
      cellType: this.type,
      encode: (cell: { value?: unknown }) => ({ value: cell.value }),
      decode: (data: unknown) => {
        if (!data || typeof data !== 'object') return null;
        const value = (data as { value?: unknown }).value;
        return typeof value === 'boolean' ? { type: this.type, value } : null;
      },
      toPlainText: (cell: { value?: unknown }) => typeof cell.value === 'boolean' ? (cell.value ? 'TRUE' : 'FALSE') : '',
      decodePlainText: (text: string) => /^(TRUE|FALSE)$/i.test(text.trim())
        ? { type: this.type, value: text.trim().toUpperCase() === 'TRUE' }
        : null,
    };
  }

  override createRenderer() {
    return defineCellRenderer(this.type, BooleanCell);
  }
}
