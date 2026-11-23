import {
  DocBlockLayoutDiff,
  DocLayoutCache,
  type DocBlockLayout,
  type LayoutSnapshot,
} from '../src';
import { type DocNodeId } from '@searsuite/sear-domain-doc';

function nodeId(id: string): DocNodeId {
  return id as DocNodeId;
}

function snapshot(): LayoutSnapshot {
  return { lines: [] };
}

function block(id: string, index: number, y: number, height: number = 10): DocBlockLayout {
  return {
    id: nodeId(id),
    index,
    lineStart: index,
    lineEnd: index + Math.max(1, Math.round(height / 10)),
    rect: { x: 0, y, width: 100, height },
    flowHeight: height,
  };
}

function cache(blocks: readonly DocBlockLayout[]): DocLayoutCache {
  return new DocLayoutCache(snapshot(), blocks);
}

describe('DocBlockLayoutDiff', () => {
  it('marks all current blocks as added without a previous cache', () => {
    const diff = DocBlockLayoutDiff.compare(null, cache([block('a', 0, 0), block('b', 1, 10)]));

    expect(diff.entries.map((entry) => entry.status)).toEqual(['added', 'added']);
    expect(diff.getChangedEntries().map((entry) => entry.id)).toEqual([nodeId('a'), nodeId('b')]);
    expect(diff.getReusableRasterCopies()).toEqual([]);
  });

  it('separates changed blocks from downstream layout shifts', () => {
    const previous = cache([block('a', 0, 0), block('b', 1, 10), block('c', 2, 20)]);
    const current = cache([block('a', 0, 0, 20), block('b', 1, 20), block('c', 2, 30)]);

    const diff = DocBlockLayoutDiff.compare(previous, current);

    expect(diff.entries.map((entry) => [entry.id, entry.status, entry.deltaY])).toEqual([
      [nodeId('a'), 'changed', 0],
      [nodeId('b'), 'shifted', 10],
      [nodeId('c'), 'shifted', 10],
    ]);
    expect(diff.getChangedEntries().map((entry) => entry.id)).toEqual([nodeId('a')]);
    expect(diff.getReusableRasterCopies()).toEqual([
      {
        id: nodeId('b'),
        index: 1,
        source: { x: 0, y: 10, width: 100, height: 10 },
        destination: { x: 0, y: 20, width: 100, height: 10 },
      },
      {
        id: nodeId('c'),
        index: 2,
        source: { x: 0, y: 20, width: 100, height: 10 },
        destination: { x: 0, y: 30, width: 100, height: 10 },
      },
    ]);
  });

  it('treats reflow block ids as changed even when layout shape is stable', () => {
    const previous = cache([block('a', 0, 0), block('b', 1, 10)]);
    const current = cache([block('a', 0, 0), block('b', 1, 10)]);

    const diff = DocBlockLayoutDiff.compare(previous, current, { reflowBlockIds: new Set([nodeId('b')]) });

    expect(diff.entries.map((entry) => [entry.id, entry.status])).toEqual([
      [nodeId('a'), 'unchanged'],
      [nodeId('b'), 'changed'],
    ]);
    expect(diff.getReusableRasterCopies().map((copy) => copy.id)).toEqual([nodeId('a')]);
  });

  it('treats repaint block ids as changed without requiring layout movement', () => {
    const previous = cache([block('a', 0, 0), block('b', 1, 10)]);
    const current = cache([block('a', 0, 0), block('b', 1, 10)]);

    const diff = DocBlockLayoutDiff.compare(previous, current, { repaintBlockIds: new Set([nodeId('b')]) });

    expect(diff.entries.map((entry) => [entry.id, entry.status])).toEqual([
      [nodeId('a'), 'unchanged'],
      [nodeId('b'), 'changed'],
    ]);
    expect(diff.getReusableRasterCopies().map((copy) => copy.id)).toEqual([nodeId('a')]);
  });

  it('reports removed blocks', () => {
    const previous = cache([block('a', 0, 0), block('b', 1, 10)]);
    const current = cache([block('a', 0, 0)]);

    const diff = DocBlockLayoutDiff.compare(previous, current);

    expect(diff.entries.map((entry) => [entry.id, entry.status])).toEqual([
      [nodeId('a'), 'unchanged'],
      [nodeId('b'), 'removed'],
    ]);
    expect(diff.hasChanges()).toBe(true);
  });
});
