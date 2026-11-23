// Whether Doc and Sheet should be separated later
/** DataStorage public API. */
export abstract class DataStorage<U, T, S = Map<U, T>> {
  /** DI token for resolving DataStorage. */
  public static readonly symbol: symbol = Symbol.for('DataStorage');

  protected data: S;

  /** Creates a DataStorage instance. */
  constructor(storage: S) {
    this.data = storage;
  }

  /** Returns the value. */
  abstract get(key: U): T | undefined;
  /** Updates the value. */
  abstract set(key: U, value: T): void;
  /** Deletes the requested entry. */
  abstract delete(key: U): void;
}
