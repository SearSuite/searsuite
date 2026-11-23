import type { SheetEditInput } from '@searsuite/sear-sheet-editor-contract';
import type {
  SheetEmbeddedEditorPlugin,
  SheetEmbeddedEditorPluginContext,
} from '../embeddedEditor/SheetEmbeddedEditorPlugin';

/** Optional key mapping hook for Sheet hosts that add cell-navigation shortcuts. */
export class SheetShortcutPlugin implements SheetEmbeddedEditorPlugin {
  public readonly key = 'sheet.shortcuts';

  public constructor(private readonly shortcuts: Readonly<Record<string, SheetEditInput>> = {}) {}

  public transformInput(input: SheetEditInput, _context: SheetEmbeddedEditorPluginContext): SheetEditInput {
    if (input.type !== 'keyDown') return input;
    return this.shortcuts[input.key] ?? input;
  }
}
