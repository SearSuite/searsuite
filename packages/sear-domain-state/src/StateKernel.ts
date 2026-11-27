import { SearError } from '@searsuite/sear-foundation-error';
import { type StateKernelAdapter, type StateKernelCommit } from './StateKernelContracts';
import { StateKernelBatch } from './StateKernelBatch';

/** Atomic state staging and ordered commit notifications, independent of input and rendering. */
export class StateKernel<Owner, Transaction, Effect = never> {
  readonly #adapter: StateKernelAdapter<Owner, Transaction>;
  readonly #onError: (error: unknown) => void;
  readonly #listeners = new Set<(commit: StateKernelCommit<Owner, Transaction, Effect>) => void>();
  readonly #pending = new Map<StateKernelCommit<Owner, Transaction, Effect>, boolean>();
  #revision = 0;
  #notifying = false;
  #destroyed = false;

  /** Creates a kernel over exclusively owned state and no-throw publication operations. */
  constructor(adapter: StateKernelAdapter<Owner, Transaction>, onError: (error: unknown) => void = () => {}) {
    this.#adapter = adapter;
    this.#onError = onError;
  }

  /** Current state-publication revision; failed and preview batches do not advance it. */
  get revision(): number {
    return this.#revision;
  }

  /** Begins a detached batch; the caller may discard it without publishing anything. */
  begin(): StateKernelBatch<Owner, Transaction> {
    if (this.#destroyed) throw new SearError('State kernel is destroyed.');
    return new StateKernelBatch(this.#adapter, this.#revision);
  }

  /** Publishes all prepared owner states before any listener can run. */
  commit(batch: StateKernelBatch<Owner, Transaction>, effect?: Effect): StateKernelCommit<Owner, Transaction, Effect> {
    if (this.#destroyed) throw new SearError('State kernel is destroyed.');
    const changes = batch.publish(this.#adapter, this.#revision);
    const commit = Object.freeze({ revision: ++this.#revision, changes, effect });
    this.#pending.set(commit, false);
    return commit;
  }

  /** Releases a commit after composition-owned post-commit work, preserving nested commit order. */
  notify(commit: StateKernelCommit<Owner, Transaction, Effect>): void {
    if (this.#destroyed) return;
    if (!this.#pending.has(commit)) throw new SearError('Unknown or already delivered state commit.');
    this.#pending.set(commit, true);
    if (this.#notifying) return;
    this.#notifying = true;
    try {
      for (const [next, ready] of this.#pending) {
        if (!ready) break;
        this.#pending.delete(next);
        for (const listener of [...this.#listeners]) {
          if (!this.#listeners.has(listener)) continue;
          try {
            listener(next);
          } catch (error) {
            try {
              this.#onError(error);
            } catch {
              /* Diagnostics cannot invalidate committed state. */
            }
          }
        }
      }
    } finally {
      this.#notifying = false;
    }
  }

  /** Observes completed publications; subscriptions own no document state. */
  subscribe(listener: (commit: StateKernelCommit<Owner, Transaction, Effect>) => void): () => void {
    if (this.#destroyed) throw new SearError('State kernel is destroyed.');
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Releases subscriptions without invoking presentation cleanup or changing stored data. */
  destroy(): void {
    this.#destroyed = true;
    this.#listeners.clear();
    this.#pending.clear();
  }
}
