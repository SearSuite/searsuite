/** DI token placeholder for the dirty-region spatial index. */
export class DirtyTree {
  /** DI token used to resolve the dirty tree implementation. */
  public static readonly symbol: symbol = Symbol.for('DirtyTree');
}
