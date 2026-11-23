import { EditorLifecycleError, EditorLifecycleErrorCode } from './EditorLifecycleError';

/** Idempotent reverse-order disposer stack used by editor composition roots. */
export class EditorLifecycleStack {
  private readonly disposers: Array<() => void> = [];
  private disposed = false;

  /** Adds one owned resource disposer in acquisition order. */
  public add(disposer: () => void): void {
    if (this.disposed) {
      throw new EditorLifecycleError(
        EditorLifecycleErrorCode.StackDisposed,
        'EditorLifecycleStack has already been disposed.',
      );
    }
    this.disposers.push(disposer);
  }

  /** Runs every disposer in reverse order and continues cleanup after individual failures. */
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const errors: unknown[] = [];
    for (let index = this.disposers.length - 1; index >= 0; index -= 1) {
      try {
        this.disposers[index]?.();
      } catch (error) {
        errors.push(error);
      }
    }
    this.disposers.length = 0;
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new EditorLifecycleError(
        EditorLifecycleErrorCode.MultipleDisposalFailures,
        'Multiple editor resources failed during teardown.',
        { failureCount: errors.length, errors },
      );
    }
  }
}
