import type { SheetEmbeddedEditorPlugin } from '../embeddedEditor/SheetEmbeddedEditorPlugin';

/** Extension point for Sheet-to-Doc integration policies. */
export class SheetDocIntegrationPlugin implements SheetEmbeddedEditorPlugin {
  public readonly key = 'sheet.doc-integration';
}
