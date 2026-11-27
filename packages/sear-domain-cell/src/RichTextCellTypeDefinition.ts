import { CellType, RichTextCellCommitStrategy } from '@searsuite/sear-domain-cell-types';
import { extractRichText } from '@searsuite/sear-domain-cell-types';

import { type CellDisplayTextProvider } from './CellDisplayTextRegistry';

import { CellTypeDefinition } from './CellTypeDefinition';

/** Built-in persisted cell type for rich-text document values. */
export class RichTextCellTypeDefinition extends CellTypeDefinition {
  /** Stable persisted type identifier for rich-text cells. */
  readonly type = CellType.RichText;
  /** Creates the commit strategy for rich-text edits. */
  override createCommitStrategies() {
    return [new RichTextCellCommitStrategy()];
  }
  /** Returns whether the stored value looks like a rich-text node array. */
  override isStoredValue(cell: { value?: unknown }): boolean {
    return (
      Array.isArray(cell.value) &&
      cell.value.every(
        (node) => typeof node === 'object' && node !== null && typeof (node as { type?: unknown }).type === 'string',
      )
    );
  }
  /** Creates the display-text provider that extracts plain text from rich text. */
  override createDisplayTextProvider(): CellDisplayTextProvider {
    return {
      cellType: this.type,
      getDisplayText: function getRichTextCellDisplayText(cell) {
        return extractRichText(cell.value);
      },
    };
  }
  override createClipboardCodec() {
    return {
      cellType: this.type,
      encode: (cell: { value?: unknown }) => ({ value: cloneValue(cell.value) }),
      decode: (data: unknown) => {
        if (!data || typeof data !== 'object') return null;
        const stored = data as { value?: unknown };
        return Array.isArray(stored.value)
          ? {
              type: this.type,
              value: cloneValue(stored.value),
            }
          : null;
      },
      toPlainText: (cell: { value?: unknown }) => extractRichText(cell.value),
    };
  }
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]));
}
