import { CellCommitContext, CellCommitStrategy } from '../CellCommitStrategy';
import { type CellMatrixElement } from '../CellMatrixElement';
import { CellType } from '../CellType';

function normalizeFormulaSource(source: string): string {
  let normalized = '';
  let quote: '"' | "'" | null = null;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (quote) {
      normalized += character;
      if (character === quote) {
        if (source[index + 1] === quote) normalized += source[++index];
        else quote = null;
      }
    } else if (character === '"' || character === "'") {
      normalized += character;
      quote = character;
    } else {
      if (/[A-Za-z_]/.test(character) && (index === 0 || !/[A-Za-z0-9_.]/.test(source[index - 1]!))) {
        let end = index + 1;
        while (end < source.length && /[A-Za-z0-9_.]/.test(source[end]!)) end += 1;
        if (source[end] === '!') {
          normalized += source.slice(index, end);
          index = end - 1;
          continue;
        }
      }
      normalized += character.toUpperCase();
    }
  }
  return normalized;
}

/** Recognizes formula source and normalizes it before persistence. */
export class FormulaCellCommitStrategy extends CellCommitStrategy {
  /** Stable identifier for the formula strategy. */
  readonly key = CellType.Formula;
  /** Ordering priority for formula input. */
  readonly priority = 90;

  /** Reports whether the input is formula source. */
  matches(context: CellCommitContext): boolean {
    return context.plainText.startsWith('=') && context.plainText.length > 1;
  }

  /** Persists formula source without evaluating it. */
  commit(context: CellCommitContext): CellMatrixElement {
    return { type: CellType.Formula, formula: normalizeFormulaSource(context.plainText) };
  }
}
