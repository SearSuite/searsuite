import type { Point } from '@searsuite/sear-foundation-rect';

/** Transient formula draft retained while a workbook mounts another sheet. */
export interface FormulaEditDraft {
  readonly cell: Point;
  readonly text: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly autoClosingParentheses?: readonly number[];
}

/** Optional workbook-owned bridge for references picked on another sheet. */
export abstract class FormulaReferencePickService {
  public static readonly symbol = Symbol.for('FormulaReferencePickService');
  public abstract hasPendingPick(): boolean;
  public abstract pick(start: Point, end: Point): void;
  public abstract cancelPendingPick(): void;
}
