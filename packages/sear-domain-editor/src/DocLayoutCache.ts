import { type DocNodeId, resolveDocNodeId, type RichDocNode } from '@searsuite/sear-domain-doc';
import { ArrayIndexedSnapshot } from './ArrayIndexedSnapshot';
import { type IndexedSnapshot } from './IndexedSnapshot';
import { type LayoutLine, type LayoutSnapshot } from './DocLayoutEngine';
import { lockLayoutSnapshot } from './lockLayoutSnapshot';

/** Rectangle contract used by document layout planning without binding to a render target. */
export interface DocLayoutRect {
  /** Left edge in document coordinates. */
  readonly x: number;
  /** Top edge in document coordinates. */
  readonly y: number;
  /** Width in document units. */
  readonly width: number;
  /** Height in document units. */
  readonly height: number;
}

/** Cached layout metadata for one top-level document block. */
export interface DocBlockLayout {
  /** Stable block identity used by retained render nodes. */
  readonly id: DocNodeId;
  /** Zero-based top-level document block index. */
  readonly index: number;
  /** Inclusive index of the first layout line belonging to this block. */
  readonly lineStart: number;
  /** Exclusive index after the last layout line belonging to this block. */
  readonly lineEnd: number;
  /** Document-space rectangle occupied by this block. */
  readonly rect: DocLayoutRect;
  /** Flow height from this block top to the next block top, or visual height for the last block. */
  readonly flowHeight: number;
}

/** Immutable snapshot of block-level document layout used by viewport and SceneGraph projection. */
export class DocLayoutCache {
  readonly #indexedLayout: IndexedSnapshot<LayoutSnapshot, DocBlockLayout, DocNodeId>;

  /** Creates a layout cache from already computed block records. */
  public constructor(
    /** Layout snapshot used to derive this cache. */
    snapshot: LayoutSnapshot,
    /** Top-level block layout records ordered by document position, or a custom indexed store. */
    blocksOrIndex: readonly DocBlockLayout[] | IndexedSnapshot<LayoutSnapshot, DocBlockLayout, DocNodeId>,
  ) {
    this.#indexedLayout = createIndexedLayout(snapshot, blocksOrIndex);
    lockLayoutSnapshot(this.#indexedLayout.snapshot);
    this.#indexedLayout.items.forEach((block) => {
      Object.freeze(block.rect);
      Object.freeze(block);
    });
    Object.freeze(this.#indexedLayout.items);
    Object.freeze(this);
  }

  /** Layout snapshot used to derive this cache. */
  public get snapshot(): LayoutSnapshot {
    return this.#indexedLayout.snapshot;
  }

  /** Top-level block layout records ordered by document position. */
  public get blocks(): readonly DocBlockLayout[] {
    return this.#indexedLayout.items;
  }

  /** Builds a block layout cache from a rich document and its layout snapshot. */
  public static fromSnapshot(
    document: readonly RichDocNode[],
    snapshot: LayoutSnapshot,
    previousCache: DocLayoutCache | null = null,
  ): DocLayoutCache {
    const groups = groupLinesByBlock(snapshot.lines);
    const blockRecords = document.map((block, blockIndex) => {
      const lineRange = groups.get(blockIndex) ?? {
        lineStart: 0,
        lineEnd: 0,
        lines: [] as LayoutLine[],
      };
      const visualRect = computeLineBounds(lineRange.lines);
      return {
        id: resolveDocNodeId(block, [blockIndex]),
        index: blockIndex,
        lineStart: lineRange.lineStart,
        lineEnd: lineRange.lineEnd,
        rect: visualRect,
        flowHeight: visualRect.height,
      };
    });

    const blocks = blockRecords.map((block, index) => {
      const next = blockRecords[index + 1];
      const flowHeight = next ? Math.max(0, next.rect.y - block.rect.y) : block.rect.height;
      return reusePreviousBlock(previousCache, { ...block, flowHeight });
    });

    return new DocLayoutCache(snapshot, blocks);
  }

  /** Returns the cached layout record for a top-level block index. */
  public getBlockByIndex(index: number): DocBlockLayout | null {
    return this.#indexedLayout.getByIndex(index);
  }

  /** Returns the cached layout record for a document block id. */
  public getBlockById(id: DocNodeId): DocBlockLayout | null {
    return this.#indexedLayout.getByKey(id);
  }

  /** Returns block ids for the supplied top-level block indexes. */
  public getBlockIdsByIndexes(indexes: readonly number[]): readonly DocNodeId[] {
    return this.#indexedLayout.getKeysByIndexes(indexes);
  }

  /** Returns all cached block records intersecting the supplied vertical range. */
  public getBlocksInVerticalRange(top: number, bottom: number): readonly DocBlockLayout[] {
    return this.blocks.filter((block) => block.rect.y < bottom && block.rect.y + block.rect.height > top);
  }

  /** Returns whether one block's flow height changed compared with another cache. */
  public hasFlowHeightChanged(previous: DocLayoutCache, blockId: DocNodeId): boolean {
    const current = this.getBlockById(blockId);
    const before = previous.getBlockById(blockId);
    return !!current && !!before && current.flowHeight !== before.flowHeight;
  }

  /** Returns whether one block's height-sensitive flow layout changed. */
  public hasBlockFlowLayoutChanged(previous: DocLayoutCache, blockId: DocNodeId): boolean {
    const current = this.getBlockById(blockId);
    const before = previous.getBlockById(blockId);
    if (!current || !before) return false;
    return (
      current.flowHeight !== before.flowHeight ||
      current.rect.height !== before.rect.height ||
      current.lineEnd - current.lineStart !== before.lineEnd - before.lineStart
    );
  }

  /**
   * Returns block indexes whose internal content layout can be reused from a previous cache.
   *
   * A downstream flow shift changes absolute `rect.y`, so the whole block record
   * cannot be reused. The renderer can still reuse the block's measured content
   * shape when line count, visual size and flow height are unchanged.
   */
  public getContentLayoutReusableBlockIndexes(previous: DocLayoutCache): readonly number[] {
    return this.blocks
      .filter((block) => {
        const before = previous.getBlockById(block.id);
        return before ? hasReusableContentLayout(before, block) : false;
      })
      .map((block) => block.index);
  }
}

function createIndexedLayout(
  snapshot: LayoutSnapshot,
  blocksOrIndex: readonly DocBlockLayout[] | IndexedSnapshot<LayoutSnapshot, DocBlockLayout, DocNodeId>,
): IndexedSnapshot<LayoutSnapshot, DocBlockLayout, DocNodeId> {
  if (!isBlockArray(blocksOrIndex)) return blocksOrIndex;
  return new ArrayIndexedSnapshot<LayoutSnapshot, DocBlockLayout, DocNodeId>(
    snapshot,
    blocksOrIndex,
    (block) => block.id,
    (block) => block.index,
  );
}

function isBlockArray(
  value: readonly DocBlockLayout[] | IndexedSnapshot<LayoutSnapshot, DocBlockLayout, DocNodeId>,
): value is readonly DocBlockLayout[] {
  return Array.isArray(value);
}

function reusePreviousBlock(previousCache: DocLayoutCache | null, block: DocBlockLayout): DocBlockLayout {
  const previous = previousCache?.getBlockById(block.id);
  return previous && isSameBlockLayout(previous, block) ? previous : block;
}

function isSameBlockLayout(blockA: DocBlockLayout, blockB: DocBlockLayout): boolean {
  return (
    blockA.index === blockB.index &&
    blockA.lineStart === blockB.lineStart &&
    blockA.lineEnd === blockB.lineEnd &&
    blockA.flowHeight === blockB.flowHeight &&
    isSameRect(blockA.rect, blockB.rect)
  );
}

function isSameRect(rectA: DocLayoutRect, rectB: DocLayoutRect): boolean {
  return rectA.x === rectB.x && rectA.y === rectB.y && rectA.width === rectB.width && rectA.height === rectB.height;
}

function hasReusableContentLayout(previous: DocBlockLayout, current: DocBlockLayout): boolean {
  return (
    previous.index === current.index &&
    previous.lineEnd - previous.lineStart === current.lineEnd - current.lineStart &&
    previous.rect.x === current.rect.x &&
    previous.rect.width === current.rect.width &&
    previous.rect.height === current.rect.height &&
    previous.flowHeight === current.flowHeight
  );
}

interface BlockLineGroup {
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly lines: readonly LayoutLine[];
}

function groupLinesByBlock(lines: readonly LayoutLine[]): Map<number, BlockLineGroup> {
  const mutableGroups = new Map<number, { lineStart: number; lineEnd: number; lines: LayoutLine[] }>();
  lines.forEach((line, lineIndex) => {
    const blockIndex = line.textNodePath[0];
    if (!Number.isInteger(blockIndex) || blockIndex < 0) return;
    const group = mutableGroups.get(blockIndex);
    if (group) {
      group.lineEnd = lineIndex + 1;
      group.lines.push(line);
      return;
    }
    mutableGroups.set(blockIndex, {
      lineStart: lineIndex,
      lineEnd: lineIndex + 1,
      lines: [line],
    });
  });
  return mutableGroups;
}

function computeLineBounds(lines: readonly LayoutLine[]): DocLayoutRect {
  if (lines.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  lines.forEach((line) => {
    const lineLeft = line.x;
    const lineTop = line.y - line.fontAscent;
    const lineRight = line.x + line.chars.reduce((sum, char) => sum + char.width, 0);
    const lineBottom = lineTop + line.height;
    left = Math.min(left, lineLeft);
    top = Math.min(top, lineTop);
    right = Math.max(right, lineRight);
    bottom = Math.max(bottom, lineBottom);
  });

  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}
