import { EditorCell } from '@searsuite/sear-render-registry';

import { defineCellRenderer } from './CellRendererDefinition';
import { CellRenderDefinition } from './CellRenderDefinition';

/** Built-in render-only definition for the active editor cell. */
export class EditorCellRenderDefinition extends CellRenderDefinition {
  /** Render-only type key for editor cells. */
  readonly type = EditorCell.symbol;
  /** Creates the renderer definition for editor cells. */
  override createRenderer() {
    return defineCellRenderer(this.type, EditorCell);
  }
}
