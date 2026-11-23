import { CellCommitStrategy, type CellCommitContext } from '../CellCommitStrategy';
import { type CellMatrixElement } from '../CellMatrixElement';
import { CellType } from '../CellType';

/** Recognizes directly entered spreadsheet logical literals. */
export class BooleanCellCommitStrategy extends CellCommitStrategy {
  readonly key = CellType.Boolean;
  readonly priority = 20;

  matches(context: CellCommitContext): boolean {
    return /^(TRUE|FALSE)$/i.test(context.plainText.trim());
  }

  commit(context: CellCommitContext): CellMatrixElement {
    return { type: CellType.Boolean, value: context.plainText.trim().toUpperCase() === 'TRUE' };
  }
}
