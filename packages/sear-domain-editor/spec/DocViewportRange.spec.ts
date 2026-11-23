import {
  DocNodeRegistry,
  ParagraphNode,
  TextNode,
  registerParagraphDocNode,
  registerTextDocNode,
  type RichDocNode,
} from '@searsuite/sear-domain-doc';

beforeAll(function registerDocViewportRangeSpecDocNodes() {
  const registry = new DocNodeRegistry();
  registerParagraphDocNode(registry);
  registerTextDocNode(registry);
});
import {
  DocLayoutCache,
  DocPageMap,
  computeViewportRange,
  type DocViewportScrollSource,
  type LayoutSnapshot,
} from '../src';

function createDocument(count: number): RichDocNode[] {
  return Array.from({ length: count }, (_unused, index) =>
    DocNodeRegistry.create({
      id: `paragraph-${index}`,
      type: ParagraphNode.nodeType,
      content: [{ type: TextNode.nodeType, attrs: {}, content: [], text: String(index) }],
    }),
  );
}

function createSnapshot(blockHeights: readonly number[]): LayoutSnapshot {
  let y = 8;
  return {
    lines: blockHeights.map((height, index) => {
      const line = {
        textNodePath: [index, 0],
        charStartOffset: 0,
        chars: [{ char: String(index), width: 10, height, fontAscent: 8 }],
        x: 0,
        y,
        height,
        fontAscent: 8,
      };
      y += height;
      return line;
    }),
  };
}

function scroll(y: number, height: number): DocViewportScrollSource {
  return {
    getState: () => ({ x: 0, y }),
    getShape: () => [100, height],
  };
}

describe('Doc computeViewportRange', () => {
  it('culls to a buffered block and page viewport range', () => {
    const cache = DocLayoutCache.fromSnapshot(createDocument(6), createSnapshot([20, 20, 20, 20, 20, 20]));
    const pageMap = DocPageMap.fromLayoutCache(cache, 40);

    expect(computeViewportRange(scroll(25, 20), cache, pageMap)).toEqual({
      startBlock: 0,
      endBlock: 3,
      startPage: 0,
      endPage: 2,
    });
  });

  it('keeps buffers inside document bounds', () => {
    const cache = DocLayoutCache.fromSnapshot(createDocument(3), createSnapshot([20, 20, 20]));
    const pageMap = DocPageMap.fromLayoutCache(cache, 40);

    expect(computeViewportRange(scroll(45, 20), cache, pageMap)).toEqual({
      startBlock: 1,
      endBlock: 2,
      startPage: 0,
      endPage: 1,
    });
  });

  it('does not expose mutable page records or lookup indexes', () => {
    const cache = DocLayoutCache.fromSnapshot(createDocument(2), createSnapshot([20, 20]));
    const pageMap = DocPageMap.fromLayoutCache(cache, 20);
    const first = pageMap.getPage(0)!;

    expect(() => { (first.rect as { y: number }).y = 999; }).toThrow();
    expect(() => { (first.blockIds as unknown as string[]).push('forged'); }).toThrow();
    expect(() => { (pageMap.pages as unknown[]).push({}); }).toThrow();
    const indexes = pageMap.getPageIndexesForBlock(cache.blocks[0]!.id);
    expect(() => { (indexes as number[]).push(999); }).toThrow();
    expect(pageMap.getPage(0)?.rect.y).toBe(0);
  });

  it('falls back safely for out-of-range scroll positions', () => {
    const cache = DocLayoutCache.fromSnapshot(createDocument(3), createSnapshot([20, 20, 20]));
    const pageMap = DocPageMap.fromLayoutCache(cache, 40);

    expect(computeViewportRange(scroll(999, 20), cache, pageMap)).toEqual({
      startBlock: 0,
      endBlock: 2,
      startPage: 0,
      endPage: 1,
    });
  });

  it('returns empty block bounds when the document has no blocks', () => {
    const cache = DocLayoutCache.fromSnapshot([], { lines: [] });
    const pageMap = DocPageMap.fromLayoutCache(cache, 40);

    expect(computeViewportRange(scroll(0, 20), cache, pageMap)).toEqual({
      startBlock: 0,
      endBlock: -1,
      startPage: 0,
      endPage: 0,
    });
  });
});
