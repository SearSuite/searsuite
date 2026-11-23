import type { Schema } from '@searsuite/sear-domain-doc-schema';
import type { SheetDocument } from './SheetEditorTypes';

/** Clones a Sheet rich-document snapshot for isolated Fake editor state. */
export function cloneDocument(document: SheetDocument): Schema[] {
  return JSON.parse(JSON.stringify(document)) as Schema[];
}
