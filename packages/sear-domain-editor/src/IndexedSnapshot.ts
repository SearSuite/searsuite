/** Generic immutable snapshot plus ordered, multi-key indexed item access. */
export abstract class IndexedSnapshot<TSnapshot, TItem, TKey> {
  /** Creates an indexed snapshot view. */
  protected constructor(public readonly snapshot: TSnapshot) {}

  /** Items in their canonical order. */
  public abstract readonly items: readonly TItem[];

  /** Returns one item by its stable key. */
  public abstract getByKey(key: TKey): TItem | null;

  /** Returns one item by its numeric index. */
  public abstract getByIndex(index: number): TItem | null;

  /** Returns keys for the supplied numeric indexes, preserving input order. */
  public abstract getKeysByIndexes(indexes: readonly number[]): readonly TKey[];
}
