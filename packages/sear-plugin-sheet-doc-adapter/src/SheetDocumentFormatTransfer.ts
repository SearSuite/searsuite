import {
  captureRichTextFormat,
  applyRichTextFormat,
  type RichTextInlineStyleRegistry,
} from '@searsuite/sear-domain-doc';
import { type SheetDocumentNode } from '@searsuite/sear-sheet-editor-contract';

/** Pure snapshot formatting using the adapter's registered inline-style contributions. */
export function createSheetDocumentFormatTransfer(readRegistry: () => RichTextInlineStyleRegistry) {
  return {
    capture: (document: readonly SheetDocumentNode[]) => captureRichTextFormat(document, readRegistry()),
    apply: (document: readonly SheetDocumentNode[], format: Readonly<Record<string, unknown>>) =>
      applyRichTextFormat(document, format, readRegistry()),
  };
}
