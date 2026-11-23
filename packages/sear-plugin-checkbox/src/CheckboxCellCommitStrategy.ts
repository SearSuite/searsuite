import { CellType, type CellCommitContext, type CellCommitStrategyDefinition } from '@searsuite/sear-domain-cell-types';
import { CheckboxCellType, parseCheckboxText } from './CheckboxCellValue';
/** Retains checkbox identity for boolean edits, including cells governed by checkbox validation. */
export class CheckboxCellCommitStrategy implements CellCommitStrategyDefinition {
  /** Stable editor-local strategy identity. */ public readonly key = 'checkbox';
  /** Runs before numeric/formula/string fallbacks, only for checkbox targets. */ public readonly priority = 1100;
  /** Creates a target predicate owned by the current editor. */ public constructor(
    private readonly hasRule?: (row: number, column: number) => boolean,
  ) {}
  /** Reports whether this strategy owns the target's edit semantics. */ public matches(
    context: CellCommitContext,
  ): boolean {
    return context.previous?.type === CheckboxCellType || !!this.hasRule?.(context.row, context.col);
  }
  /** Produces boolean cells, clears empty edits, or leaves permitted invalid warning input as text. */ public commit(
    context: CellCommitContext,
  ) {
    if (!context.plainText.trim()) return null;
    const value = parseCheckboxText(context.plainText);
    return value === null ? { type: CellType.String, value: context.plainText } : { type: CheckboxCellType, value };
  }
}
