import { CellCommitContext, CellCommitStrategy } from '../CellCommitStrategy';
import { CellType } from '../CellType';

/** Removes a cell when its editor document has no semantic text. */
export class EmptyCellCommitStrategy extends CellCommitStrategy {
  /** Stable identifier for the empty-cell strategy. */
  readonly key = CellType.Empty;
  /** Ordering priority for empty input. */
  readonly priority = 100;

  /** Reports whether the input should clear the cell. */
  matches(context: CellCommitContext): boolean {
    return context.plainText === '';
  }

  /** Converts empty input into an absent cell value. */
  commit(): null {
    return null;
  }
}
