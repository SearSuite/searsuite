import { SearError } from '@searsuite/sear-foundation-error';
import { type DocLayoutCache, type DocBlockLayout } from './DocLayoutCache';
import { type DocPageLayout, type DocPageMap } from './DocPageMap';

/** Minimal scroll/viewport contract needed to compute a document viewport range. */
export interface DocViewportScrollSource {
  /** Returns the current scroll offset in document coordinates. */
  getState(): { readonly x: number; readonly y: number };
  /** Returns the viewport width/height. */
  getShape(): readonly [number, number];
}

/** Inclusive visible block/page range within the current document viewport. */
export interface DocViewportRange {
  /** First top-level document block index included in the buffered viewport. */
  readonly startBlock: number;
  /** Last top-level document block index included in the buffered viewport. */
  readonly endBlock: number;
  /** First page index included in the buffered viewport. */
  readonly startPage: number;
  /** Last page index included in the buffered viewport. */
  readonly endPage: number;
}

/**
 * Computes the visible document block/page range from scroll state and cached layout.
 *
 * This mirrors Sheet's viewport-range helper at the responsibility level:
 * convert viewport bounds to inclusive start/end indexes and include a one-item
 * buffer on each side. Consumers decide how to query blocks/pages or render.
 */
export function computeViewportRange(
  scrollSource: DocViewportScrollSource,
  layoutCache: DocLayoutCache,
  pageMap: DocPageMap,
  offset: { readonly x: number; readonly y: number } = { x: 0, y: 0 },
): DocViewportRange {
  const state = scrollSource.getState();
  const [, viewportHeight] = scrollSource.getShape();

  const totalBlocks = layoutCache.blocks.length;
  const totalPages = pageMap.pages.length;
  const viewTop = state.y + offset.y;
  const viewBottom = viewTop + viewportHeight;

  let startBlock = 0;
  if (viewTop > 0 && totalBlocks > 0) {
    try {
      startBlock = getBlockIndexByDimension(layoutCache.blocks, viewTop);
      if (startBlock > 0) startBlock--;
    } catch {
      startBlock = 0;
    }
  }

  let endBlock = totalBlocks - 1;
  if (viewBottom > 0 && totalBlocks > 0) {
    try {
      endBlock = getBlockIndexByDimension(layoutCache.blocks, viewBottom);
      if (endBlock < totalBlocks - 1) endBlock++;
    } catch {
      endBlock = totalBlocks - 1;
    }
  }

  let startPage = 0;
  if (viewTop > 0 && totalPages > 0) {
    try {
      startPage = getPageIndexByDimension(pageMap.pages, viewTop);
      if (startPage > 0) startPage--;
    } catch {
      startPage = 0;
    }
  }

  let endPage = totalPages - 1;
  if (viewBottom > 0 && totalPages > 0) {
    try {
      endPage = getPageIndexByDimension(pageMap.pages, viewBottom);
      if (endPage < totalPages - 1) endPage++;
    } catch {
      endPage = totalPages - 1;
    }
  }
  return { startBlock, endBlock, startPage, endPage };
}

function getBlockIndexByDimension(blocks: readonly DocBlockLayout[], dimension: number): number {
  if (!blocks.length) return -1;
  const documentBottom = getBlockBottom(blocks[blocks.length - 1]);
  if (dimension < 0 || dimension > documentBottom) throw new SearError('Doc block dimension out of bounds');

  let left = 0;
  let right = blocks.length - 1;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    getBlockBottom(blocks[mid]) < dimension ? (left = mid + 1) : (right = mid);
  }
  return left;
}

function getPageIndexByDimension(pages: readonly DocPageLayout[], dimension: number): number {
  if (!pages.length) return -1;
  const documentBottom = pages[pages.length - 1].rect.y + pages[pages.length - 1].rect.height;
  if (dimension < 0 || dimension > documentBottom) throw new SearError('Doc page dimension out of bounds');

  let left = 0;
  let right = pages.length - 1;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    pages[mid].rect.y + pages[mid].rect.height < dimension ? (left = mid + 1) : (right = mid);
  }
  return left;
}

function getBlockBottom(block: DocBlockLayout): number {
  return block.rect.y + Math.max(block.rect.height, block.flowHeight);
}
