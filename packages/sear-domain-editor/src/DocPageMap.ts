import { type DocNodeId } from '@searsuite/sear-domain-doc';
import { type DocBlockLayout, type DocLayoutCache, type DocLayoutRect } from './DocLayoutCache';

const EMPTY_PAGE_INDEXES: readonly number[] = Object.freeze([]);

/** Layout metadata for one document page. */
export interface DocPageLayout {
  /** Zero-based page index. */
  readonly index: number;
  /** Page rectangle in document coordinates. */
  readonly rect: DocLayoutRect;
  /** Block ids that intersect this page. */
  readonly blockIds: readonly DocNodeId[];
}

/** Maps document blocks to pages for viewport range queries and virtualization. */
export class DocPageMap {
  readonly #pagesByIndex = new Map<number, DocPageLayout>();
  readonly #pageIndexesByBlockId = new Map<DocNodeId, number[]>();

  /** Creates a page map from immutable page records. */
  public constructor(
    /** Page height used by this map. */
    public readonly pageHeight: number,
    /** Gap between pages in document coordinates. */
    public readonly pageGap: number,
    /** Ordered page layout records. */
    public readonly pages: readonly DocPageLayout[],
  ) {
    pages.forEach((page) => {
      Object.freeze(page.rect);
      Object.freeze(page.blockIds);
      Object.freeze(page);
      this.#pagesByIndex.set(page.index, page);
      page.blockIds.forEach((blockId) => {
        const existing = this.#pageIndexesByBlockId.get(blockId);
        if (existing) {
          existing.push(page.index);
          return;
        }
        this.#pageIndexesByBlockId.set(blockId, [page.index]);
      });
    });
    this.#pageIndexesByBlockId.forEach((indexes) => Object.freeze(indexes));
    Object.freeze(pages);
    Object.freeze(this);
  }

  /** Builds a page map by intersecting cached block rectangles with fixed-height pages. */
  public static fromLayoutCache(cache: DocLayoutCache, pageHeight: number, pageGap: number = 0): DocPageMap {
    const safePageHeight = Math.max(1, pageHeight);
    const stride = safePageHeight + Math.max(0, pageGap);
    const documentBottom = cache.blocks.reduce(
      (bottom, block) => Math.max(bottom, block.rect.y + Math.max(block.rect.height, block.flowHeight)),
      safePageHeight,
    );
    const pageCount = Math.max(1, Math.ceil(documentBottom / stride));
    const blockIdsByPage = Array.from({ length: pageCount }, createEmptyBlockIdList);
    for (const block of cache.blocks) {
      const firstPage = getPageIndex(block.rect.y, stride, pageCount);
      const blockBottom = block.rect.y + Math.max(block.rect.height, block.flowHeight);
      const lastPage = getPageIndex(Math.max(block.rect.y, blockBottom - 1), stride, pageCount);
      for (let pageIndex = firstPage; pageIndex <= lastPage; pageIndex++) {
        const top = pageIndex * stride;
        const pageBottom = top + safePageHeight;
        if (intersectsPage(block, top, pageBottom)) blockIdsByPage[pageIndex].push(block.id);
      }
    }
    const pages = blockIdsByPage.map(function createDocPageLayout(blockIds, index) {
      const top = index * stride;
      return {
        index,
        rect: { x: 0, y: top, width: Number.POSITIVE_INFINITY, height: safePageHeight },
        blockIds,
      };
    });
    return new DocPageMap(safePageHeight, Math.max(0, pageGap), pages);
  }

  /** Returns a page record by index. */
  public getPage(index: number): DocPageLayout | null {
    return this.#pagesByIndex.get(index) ?? null;
  }

  /** Returns pages for the supplied page indexes, preserving page order. */
  public getPagesByIndexes(indexes: readonly number[]): readonly DocPageLayout[] {
    const requested = new Set(indexes);
    return this.pages.filter((page) => requested.has(page.index));
  }

  /** Returns page indexes that intersect a block id. */
  public getPageIndexesForBlock(blockId: DocNodeId): readonly number[] {
    return this.#pageIndexesByBlockId.get(blockId) ?? EMPTY_PAGE_INDEXES;
  }

  /** Returns all pages intersecting a block layout record. */
  public getPagesForBlock(block: DocBlockLayout): readonly DocPageLayout[] {
    return this.getPagesByIndexes(this.getPageIndexesForBlock(block.id));
  }

  /** Returns all pages intersecting the supplied vertical document range. */
  public getPagesInVerticalRange(top: number, bottom: number): readonly DocPageLayout[] {
    return this.pages.filter((page) => page.rect.y < bottom && page.rect.y + page.rect.height > top);
  }
}

function intersectsPage(block: DocBlockLayout, pageTop: number, pageBottom: number): boolean {
  return block.rect.y < pageBottom && block.rect.y + Math.max(block.rect.height, block.flowHeight) > pageTop;
}

function createEmptyBlockIdList(): DocNodeId[] {
  return [];
}

function getPageIndex(y: number, stride: number, pageCount: number): number {
  return Math.min(pageCount - 1, Math.max(0, Math.floor(Math.max(0, y) / stride)));
}
