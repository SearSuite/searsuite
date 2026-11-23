import { IndexedSnapshot } from './IndexedSnapshot';

/** Array and Map backed implementation of IndexedSnapshot. */
export class ArrayIndexedSnapshot<TSnapshot, TItem, TKey> extends IndexedSnapshot<TSnapshot, TItem, TKey> {
  private readonly itemsByKey = new Map<TKey, TItem>();
  private readonly keysByIndex = new Map<number, TKey>();

  /** Creates an indexed snapshot from ordered items and selector functions. */
  public constructor(
    snapshot: TSnapshot,
    public readonly items: readonly TItem[],
    private readonly getKey: (item: TItem) => TKey,
    private readonly getIndex: (item: TItem) => number,
  ) {
    super(snapshot);
    items.forEach((item) => {
      const key = getKey(item);
      this.itemsByKey.set(key, item);
      this.keysByIndex.set(getIndex(item), key);
    });
  }

  /** Returns one item by its stable key. */
  public getByKey(key: TKey): TItem | null {
    return this.itemsByKey.get(key) ?? null;
  }

  /** Returns one item by its numeric index. */
  public getByIndex(index: number): TItem | null {
    const key = this.keysByIndex.get(index);
    return key === void 0 ? null : this.getByKey(key);
  }

  /** Returns keys for the supplied numeric indexes, preserving input order. */
  public getKeysByIndexes(indexes: readonly number[]): readonly TKey[] {
    return indexes.map((index) => this.keysByIndex.get(index)).filter((key): key is TKey => key !== void 0);
  }
}
