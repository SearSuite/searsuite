/** State-owner operations used by the transaction kernel without a presentation dependency. */
export interface StateKernelAdapter<Owner, Transaction> {
  forEachOwner(transaction: Transaction, visit: (owner: Owner) => void): void;
  /** Reads the composed semantic style for one cell without exposing drawing types. */
  read(owner: Owner): unknown;
  clone(state: unknown): unknown;
  apply(owner: Owner, state: unknown, transaction: Transaction): unknown | null;
  prepare(owner: Owner, state: unknown): unknown;
  /** Publishes already prepared states. This runtime-owned operation must not throw. */
  publish(states: ReadonlyMap<Owner, unknown>): void;
}

/** One successful state publication, optionally accompanied by composition-owned effects. */
export interface StateKernelCommit<Owner, Transaction, Effect = never> {
  /** Monotonically increasing revision of successfully published state. */
  readonly revision: number;
  readonly changes: ReadonlyMap<Owner, readonly Transaction[]>;
  readonly effect: Effect | undefined;
}
