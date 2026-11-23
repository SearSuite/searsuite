import { SearError } from '@searsuite/sear-foundation-error';
import { CellCommitContext, CellCommitStrategy } from '../CellCommitStrategy';
import { type CellMatrixElement } from '../CellMatrixElement';
import { CellType } from '../CellType';
import { interpretNumberInput } from './interpretNumberInput';

/** Infers numeric values after more-specific domain types have had a chance to match. */
export class NumberCellCommitStrategy extends CellCommitStrategy {
  /** Stable identifier for the number strategy. */
  readonly key = CellType.Number;
  /** Ordering priority for numeric input. */
  readonly priority = 10;

  /** Reports whether the input is a valid numeric value. */
  matches(context: CellCommitContext): boolean {
    return interpretNumberInput(context.plainText, context.format, context.formatLocale, context.previous) !== null;
  }

  /** Persists input as a numeric cell. */
  commit(context: CellCommitContext): CellMatrixElement {
    const result = interpretNumberInput(context.plainText, context.format, context.formatLocale, context.previous);
    if (!result) throw new SearError('NumberCellCommitStrategy committed a non-numeric value.');
    return { type: CellType.Number, value: result.value };
  }

  inferFormat(context: CellCommitContext) {
    return interpretNumberInput(context.plainText, context.format, context.formatLocale, context.previous)?.format ?? null;
  }
}
