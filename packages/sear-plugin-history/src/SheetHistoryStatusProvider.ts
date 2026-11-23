/** Immutable status published whenever one editor's history availability changes. */
export interface SheetHistoryStatus {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

/** Editor-local DI contract used by plugins that render history controls. */
export abstract class SheetHistoryStatusProvider {
  /** DI token for resolving the active editor's history status provider. */
  public static readonly symbol = Symbol.for('SheetHistoryStatusProvider');

  /** Returns the current editor-local history availability. */
  abstract getStatus(): SheetHistoryStatus;
  /** Observes future history availability changes and returns an idempotent disposer. */
  abstract subscribe(listener: (status: SheetHistoryStatus) => void): () => void;
}
