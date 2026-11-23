import { AffixCell } from '@searsuite/sear-render-registry';

import { defineCellRenderer } from './CellRendererDefinition';
import { CellRenderDefinition } from './CellRenderDefinition';

/** Built-in render roles that do not correspond to persisted cell values. */
export class AffixCellRenderDefinition extends CellRenderDefinition {
  /** Render-only type key for affix cells. */
  readonly type = AffixCell.symbol;
  /** Creates the renderer definition for affix cells. */
  override createRenderer() {
    return defineCellRenderer(this.type, AffixCell);
  }
}
