import { SearError } from '@searsuite/sear-foundation-error';
import { type StateKernelAdapter } from './StateKernelContracts';

/** Prospective owner states isolated from committed data until the entire batch succeeds. */
export class StateKernelBatch<Owner, Transaction> {
  readonly #adapter: StateKernelAdapter<Owner, Transaction>;
  readonly #revision: number;
  readonly #states = new Map<Owner, unknown>();
  readonly #reads = new Map<Owner, unknown>();
  readonly #changes = new Map<Owner, Transaction[]>();
  #closed = false;

  /** Batches are created by StateKernel.begin(). */
  constructor(adapter: StateKernelAdapter<Owner, Transaction>, revision: number) {
    this.#adapter = adapter;
    this.#revision = revision;
  }

  /** Reads prospective state for projection planning, falling back to the current owner. */
  read(owner: Owner): unknown {
    if (this.#states.has(owner)) return this.#states.get(owner);
    const state = this.#adapter.read(owner);
    if (!this.#reads.has(owner)) this.#reads.set(owner, state);
    return state;
  }

  /** Applies an operation to each interested owner using independent mutable copies. */
  stage(transaction: Transaction): boolean {
    if (this.#closed) throw new SearError('State batch is closed.');
    let changed = false;
    try {
      this.#adapter.forEachOwner(transaction, (owner) => {
        const previous = this.#states.has(owner) ? this.#states.get(owner) : this.#adapter.clone(this.read(owner));
        const next = this.#adapter.apply(owner, previous, transaction);
        if (next === null) return;
        this.#states.set(owner, next);
        const transactions = this.#changes.get(owner) ?? [];
        transactions.push(transaction);
        this.#changes.set(owner, transactions);
        changed = true;
      });
    } catch (error) {
      this.#closed = true;
      throw error;
    }
    return changed;
  }

  /** Returns detached staged states for non-publishing validation. */
  preview(): ReadonlyMap<Owner, unknown> {
    this.#closed = true;
    return new Map(this.#states);
  }

  /** Prepares every owner before the runtime publishes any state. */
  publish(
    adapter: StateKernelAdapter<Owner, Transaction>,
    revision: number,
  ): ReadonlyMap<Owner, readonly Transaction[]> {
    if (this.#closed) throw new SearError('State batch is closed.');
    this.#closed = true;
    if (adapter !== this.#adapter) throw new SearError('State batch belongs to another kernel.');
    if (revision !== this.#revision)
      for (const [owner, state] of this.#reads)
        if (!Object.is(state, adapter.read(owner))) throw new SearError('State batch read an obsolete owner revision.');
    const prepared = new Map<Owner, unknown>();
    for (const [owner, state] of this.#states) prepared.set(owner, adapter.prepare(owner, state));
    adapter.publish(prepared);
    return new Map([...this.#changes].map(([owner, transactions]) => [owner, Object.freeze([...transactions])]));
  }
}
