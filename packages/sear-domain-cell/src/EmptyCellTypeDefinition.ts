import { CellType, EmptyCellCommitStrategy } from '@searsuite/sear-domain-cell-types';
import { EmptyCell } from '@searsuite/sear-render-registry';

import { defineCellRenderer } from './CellRendererDefinition';
import { CellTypeDefinition } from './CellTypeDefinition';

/** Built-in persisted cell type for empty cells. */
export class EmptyCellTypeDefinition extends CellTypeDefinition {
  /** Stable persisted type identifier for empty cells. */
  readonly type = CellType.Empty;
  /** Creates the commit strategy that clears cell content. */
  override createCommitStrategies() {
    return [new EmptyCellCommitStrategy()];
  }
  /** Creates the renderer definition for empty cells. */
  override createRenderer() {
    return defineCellRenderer(this.type, EmptyCell);
  }
}
