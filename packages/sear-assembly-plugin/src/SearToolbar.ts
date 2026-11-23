/** Platform-neutral toolbar lifecycle contract. */
export abstract class SearToolbar {
  /** DI token for resolving SearToolbar. */
  public static readonly symbol: symbol = Symbol.for('SearToolbar');

  /** Attaches this adapter to its host surface. */
  abstract mount(target: unknown): void;
  /** Releases resources owned by SearToolbar. */
  abstract destroy(): void;
}
