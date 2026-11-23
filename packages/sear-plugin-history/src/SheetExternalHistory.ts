export interface SheetExternalHistoryStatus {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoOrder?: number;
  readonly redoOrder?: number;
}

/** Optional parent history visible through a mounted Sheet editor. */
export abstract class SheetExternalHistory {
  public static readonly symbol = Symbol.for('SheetExternalHistory');
  public abstract getStatus(): SheetExternalHistoryStatus;
  public abstract subscribe(listener: () => void): () => void;
  public abstract undo(): void | Promise<void>;
  public abstract redo(): void | Promise<void>;
  /** Allocates an order shared with parent history when one is available. */
  public nextSequence(): number { return 0; }
}
