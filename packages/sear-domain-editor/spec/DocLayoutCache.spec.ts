import { DocLayoutCache, IndexedSnapshot, type DocBlockLayout, type LayoutSnapshot } from '../src';
import { type DocNodeId } from '@searsuite/sear-domain-doc';

function nodeId(id: string): DocNodeId {
  return id as DocNodeId;
}

function snapshot(): LayoutSnapshot {
  return { lines: [] };
}

function block(id: string, index: number, y: number): DocBlockLayout {
  return {
    id: nodeId(id),
    index,
    lineStart: index,
    lineEnd: index + 1,
    rect: { x: 0, y, width: 100, height: 10 },
    flowHeight: 10,
  };
}

class ReverseIndexedSnapshot extends IndexedSnapshot<LayoutSnapshot, DocBlockLayout, DocNodeId> {
  private readonly byKey = new Map<DocNodeId, DocBlockLayout>();
  private readonly byIndex = new Map<number, DocBlockLayout>();

  public constructor(
    inputSnapshot: LayoutSnapshot,
    public readonly items: readonly DocBlockLayout[],
  ) {
    super(inputSnapshot);
    items.forEach((item) => {
      this.byKey.set(item.id, item);
      this.byIndex.set(item.index, item);
    });
  }

  public getByKey(key: DocNodeId): DocBlockLayout | null {
    return this.byKey.get(key) ?? null;
  }

  public getByIndex(index: number): DocBlockLayout | null {
    return this.byIndex.get(index) ?? null;
  }

  public getKeysByIndexes(indexes: readonly number[]): readonly DocNodeId[] {
    return indexes
      .map((index) => this.byIndex.get(index)?.id)
      .filter((id): id is DocNodeId => id !== void 0)
      .reverse();
  }
}

describe('DocLayoutCache', () => {
  it('uses the default indexed snapshot for ordered blocks and lookup maps', () => {
    const blocks = [block('a', 0, 0), block('b', 1, 10), block('c', 2, 20)];
    const cache = new DocLayoutCache(snapshot(), blocks);

    expect(cache.blocks).toBe(blocks);
    expect(cache.getBlockById(nodeId('b'))).toBe(blocks[1]);
    expect(cache.getBlockByIndex(2)).toBe(blocks[2]);
    expect(cache.getBlockIdsByIndexes([2, 0, 9])).toEqual([nodeId('c'), nodeId('a')]);
    expect(() => { (cache.snapshot.lines as unknown[]).push({}); }).toThrow();
    expect(() => { (blocks[1].rect as { y: number }).y = 999; }).toThrow();
    expect(() => { (cache.blocks as DocBlockLayout[]).push(block('d', 3, 30)); }).toThrow();
  });

  it('accepts a custom indexed snapshot implementation', () => {
    const blocks = [block('a', 0, 0), block('b', 1, 10), block('c', 2, 20)];
    const cache = new DocLayoutCache(snapshot(), new ReverseIndexedSnapshot(snapshot(), blocks));

    expect(cache.blocks).toBe(blocks);
    expect(cache.getBlockByIndex(1)).toBe(blocks[1]);
    expect(cache.getBlockIdsByIndexes([0, 1, 2])).toEqual([nodeId('c'), nodeId('b'), nodeId('a')]);
    expect(Object.keys(cache)).not.toContain('indexedLayout');
  });
});
