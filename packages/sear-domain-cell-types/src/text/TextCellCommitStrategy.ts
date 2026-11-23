import { CellCommitContext, CellCommitStrategy } from '../CellCommitStrategy';
import { type CellMatrixElement } from '../CellMatrixElement';
import { normalizeCellFormat } from '../CellFormat';
import { CellType } from '../CellType';

/** Handles explicit text input: Text-format cells and apostrophe-prefixed values. */
export class TextCellCommitStrategy extends CellCommitStrategy {
  /** Stable identifier for the explicit text strategy. */
  readonly key = CellType.String;
  /** Ordering priority for explicit text input. */
  readonly priority = 95;

  /** Reports whether the input is explicitly typed as text. */
  matches(context: CellCommitContext): boolean {
    return context.plainText.startsWith("'") || TextCellCommitStrategy.isTextFormat(context.format);
  }

  /** Persists input as an explicit text cell. */
  commit(context: CellCommitContext): CellMatrixElement {
    const value = context.plainText.startsWith("'") ? context.plainText.slice(1) : context.plainText;
    return { type: CellType.String, value };
  }

  private static isTextFormat(format: unknown): boolean {
    return normalizeCellFormat(format).kind === 'text';
  }
}

export { DefaultStringCellCommitStrategy } from './DefaultStringCellCommitStrategy';
