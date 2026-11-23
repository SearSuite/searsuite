import type { Schema } from '@searsuite/sear-domain-doc-schema';
import type { SheetDocument } from '@searsuite/sear-sheet-editor-contract';

/** Clones the shared schema snapshot at the Sheet/adapter ownership boundary. */
export function cloneSheetDocument(document: SheetDocument): Schema[] {
  return JSON.parse(JSON.stringify(document)) as Schema[];
}

/** Locks a render-session snapshot once so plugin reads cannot change later frames. */
export function lockSheetDocumentSnapshot(document: SheetDocument): SheetDocument {
  const lock = (value: unknown): void => {
    if (value === null || typeof value !== 'object') return;
    for (const nested of Object.values(value)) lock(nested);
    Object.freeze(value);
  };
  lock(document);
  return document;
}

/** Supplies the minimal editable paragraph for an empty cell snapshot. */
export function ensureEditableDocument(document: SheetDocument): Schema[] {
  const cloned = cloneSheetDocument(document);
  return cloned.length > 0 ? cloned : [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }];
}
