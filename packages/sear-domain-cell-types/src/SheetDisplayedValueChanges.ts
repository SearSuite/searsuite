import { SearError } from '@searsuite/sear-foundation-error';

/** A cell whose displayed value changed after a derived value update. */
export interface SheetDisplayedValueCoordinate {
  readonly row: number;
  readonly column: number;
}

export type SheetDisplayedValueChangeListener = (cells: readonly SheetDisplayedValueCoordinate[]) => void;

/** Editor-local fanout for changes to displayed cell values. */
export class SheetDisplayedValueChanges {
  public static readonly symbol = Symbol.for('SheetDisplayedValueChanges');

  readonly #listeners = new Map<SheetDisplayedValueChangeListener, boolean>();
  #isCommandExecuting: (() => boolean) | null = null;
  #runWithoutMutationAuthority: (<Value>(callback: () => Value) => Value) | null = null;
  #disposed = false;

  public constructor(private readonly warn: (error: unknown) => void) {}

  public subscribe(listener: SheetDisplayedValueChangeListener): () => void {
    this.#listeners.set(listener, this.#isCommandExecuting === null);
    return () => { this.#listeners.delete(listener); };
  }

  /** Seals publishing after startup while keeping host listeners outside command authority. */
  public enforceCommandBoundary(
    isExecuting: () => boolean,
    runWithoutMutationAuthority: <Value>(callback: () => Value) => Value,
  ): void {
    if (this.#isCommandExecuting) throw new SearError('Displayed value changes are already bound to an editor.');
    this.#isCommandExecuting = isExecuting;
    this.#runWithoutMutationAuthority = runWithoutMutationAuthority;
    Object.preventExtensions(this);
  }

  public publish(cells: readonly SheetDisplayedValueCoordinate[]): void {
    if (this.#disposed || cells.length === 0) return;
    if (this.#isCommandExecuting && !this.#isCommandExecuting()) {
      throw new SearError('Displayed value changes must run through editor.commands.run(...).');
    }
    for (const [listener, registeredDuringStartup] of [...this.#listeners]) {
      const notify = (): void => {
        try {
          listener(cells);
        } catch (error) {
          this.warn(error);
        }
      };
      if (registeredDuringStartup) notify();
      else this.#runWithoutMutationAuthority!(notify);
    }
  }

  public dispose(): void {
    this.#disposed = true;
    this.#listeners.clear();
  }
}
