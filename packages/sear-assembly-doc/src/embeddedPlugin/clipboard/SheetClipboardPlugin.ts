import { SearError } from '@searsuite/sear-foundation-error';
import type { Schema } from '@searsuite/sear-domain-doc-schema';
type SheetDocument = readonly Schema[];
type SheetDocumentNode = Schema;
import type { SheetEmbeddedEditorPlugin } from '../SheetEmbeddedEditorPlugin';

/** Sheet clipboard codec for the shared rich-document snapshot protocol. */
export class SheetClipboardPlugin implements SheetEmbeddedEditorPlugin {
  public readonly key = 'sheet.clipboard';

  public serialize(document: SheetDocument): string {
    return JSON.stringify(document);
  }

  public deserialize(value: string): SheetDocument {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new SearError('Sheet clipboard payload must contain a document array.');
    if (!parsed.every(isDocumentNode))
      throw new SearError('Sheet clipboard payload contains an invalid document node.');
    return parsed as SheetDocumentNode[];
  }
}

function isDocumentNode(value: unknown): value is SheetDocumentNode {
  if (!value || typeof value !== 'object') return false;
  const node = value as { type?: unknown; text?: unknown; content?: unknown };
  if (typeof node.type !== 'string') return false;
  if (node.text !== void 0 && typeof node.text !== 'string') return false;
  if (node.content !== void 0 && (!Array.isArray(node.content) || !node.content.every(isDocumentNode))) return false;
  return true;
}
