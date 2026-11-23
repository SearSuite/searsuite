import type { Schema } from '@searsuite/sear-domain-doc-schema';
import type { SheetTextPosition } from './SheetEditorTypes';

/** Finds the first text leaf used by the deterministic Fake editor. */
export function firstTextNode(document: Schema[]): { node: Schema; path: SheetTextPosition['path'] } | null {
  for (let paragraphIndex = 0; paragraphIndex < document.length; paragraphIndex += 1) {
    const paragraph = document[paragraphIndex];
    const text = paragraph?.content?.[0];
    if (text && typeof text.text === 'string') return { node: text, path: [paragraphIndex, 0] };
  }
  return null;
}
