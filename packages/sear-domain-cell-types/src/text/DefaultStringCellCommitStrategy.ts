import { CellCommitContext, CellCommitStrategy } from '../CellCommitStrategy';
import { type CellMatrixElement } from '../CellMatrixElement';
import { CellType } from '../CellType';

/** Final fallback: persist otherwise-unclassified input as plain text. */
export class DefaultStringCellCommitStrategy extends CellCommitStrategy {
  /** Stable identifier for the default string strategy. */
  readonly key = 'fallback-string';
  /** Ordering priority for the default string fallback. */
  readonly priority = 0;

  /** Matches input not claimed by a more specific strategy. */
  matches(): boolean {
    return true;
  }

  /** Persists unmatched input as a string cell. */
  commit(context: CellCommitContext): CellMatrixElement {
    return { type: CellType.String, value: context.plainText };
  }
}
