import { SearError } from '@searsuite/sear-foundation-error';

interface FormulaProviderEntry<T> {
  readonly id: number;
  readonly provider: T;
  readonly priority: number;
}

/** Owns ordered provider registrations without adding work to provider reads. */
export class FormulaProviderEntries<T> {
  #entries: readonly FormulaProviderEntry<T>[] = Object.freeze([]);
  #nextId = 0;
  #isCommandExecuting: (() => boolean) | undefined;
  #dispatchRemoval: ((id: number) => void) | undefined;

  public register(provider: T, priority: number = 0): () => void {
    this.#assertCommandWrite();
    const entry = Object.freeze({ id: this.#nextId++, provider, priority });
    this.#entries = Object.freeze([...this.#entries, entry]
      .sort((left, right) => right.priority - left.priority || left.id - right.id));
    let disposed = false;
    return () => {
      if (disposed) return;
      this.unregister(entry.id);
      disposed = true;
    };
  }

  public unregister(id: number): void {
    if (this.#isCommandExecuting && !this.#isCommandExecuting()) {
      this.#dispatchRemoval!(id);
      return;
    }
    if (this.#entries.some((entry) => entry.id === id)) {
      this.#entries = Object.freeze(this.#entries.filter((entry) => entry.id !== id));
    }
  }

  public getEntries(): readonly FormulaProviderEntry<T>[] {
    return this.#entries;
  }

  public seal(isCommandExecuting: () => boolean, dispatchRemoval: (id: number) => void): void {
    if (this.#isCommandExecuting) throw new SearError('Formula provider registry is already bound to an editor.');
    this.#isCommandExecuting = isCommandExecuting;
    this.#dispatchRemoval = dispatchRemoval;
    Object.preventExtensions(this);
  }

  #assertCommandWrite(): void {
    if (this.#isCommandExecuting && !this.#isCommandExecuting()) {
      throw new SearError('Formula provider registration must run through editor.commands.run(...).');
    }
  }
}
