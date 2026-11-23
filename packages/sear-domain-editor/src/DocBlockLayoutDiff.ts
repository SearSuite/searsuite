import { type DocNodeId } from '@searsuite/sear-domain-doc';
import { type DocBlockLayout, type DocLayoutCache, type DocLayoutRect } from './DocLayoutCache';

export type DocBlockLayoutDiffStatus = 'unchanged' | 'shifted' | 'changed' | 'added' | 'removed';

export interface DocBlockLayoutDiffOptions {
  /** Reflow blocks whose render output changed even if their measured layout shape did not. */
  readonly reflowBlockIds?: ReadonlySet<DocNodeId>;
  /** Repaint blocks whose render output changed without invalidating layout cache. */
  readonly repaintBlockIds?: ReadonlySet<DocNodeId>;
}

export interface DocBlockLayoutDiffEntry {
  readonly id: DocNodeId;
  readonly index: number;
  readonly status: DocBlockLayoutDiffStatus;
  readonly previous: DocBlockLayout | null;
  readonly current: DocBlockLayout | null;
  readonly deltaY: number;
}

export interface DocBlockRasterReuse {
  readonly id: DocNodeId;
  readonly index: number;
  readonly source: DocLayoutRect;
  readonly destination: DocLayoutRect;
}

/** Compares two block-layout snapshots and exposes render-neutral reuse facts. */
export class DocBlockLayoutDiff {
  readonly #entriesById = new Map<DocNodeId, DocBlockLayoutDiffEntry>();

  public constructor(public readonly entries: readonly DocBlockLayoutDiffEntry[]) {
    entries.forEach((entry) => {
      Object.freeze(entry);
      this.#entriesById.set(entry.id, entry);
    });
    Object.freeze(entries);
    Object.freeze(this);
  }

  public static compare(
    previous: DocLayoutCache | null,
    current: DocLayoutCache,
    options: DocBlockLayoutDiffOptions = {},
  ): DocBlockLayoutDiff {
    if (!previous) {
      return new DocBlockLayoutDiff(
        current.blocks.map((block) => ({
          id: block.id,
          index: block.index,
          status: 'added',
          previous: null,
          current: block,
          deltaY: 0,
        })),
      );
    }

    const entries: DocBlockLayoutDiffEntry[] = [];
    const currentIds = new Set<DocNodeId>();
    for (const block of current.blocks) {
      currentIds.add(block.id);
      const before = previous.getBlockById(block.id);
      entries.push(createCurrentEntry(before, block, options.reflowBlockIds, options.repaintBlockIds));
    }

    for (const before of previous.blocks) {
      if (currentIds.has(before.id)) continue;
      entries.push({
        id: before.id,
        index: before.index,
        status: 'removed',
        previous: before,
        current: null,
        deltaY: 0,
      });
    }

    return new DocBlockLayoutDiff(entries);
  }

  public getEntry(id: DocNodeId): DocBlockLayoutDiffEntry | null {
    return this.#entriesById.get(id) ?? null;
  }

  public getChangedEntries(): readonly DocBlockLayoutDiffEntry[] {
    return this.entries.filter(isChangedEntry);
  }

  public getShiftedEntries(): readonly DocBlockLayoutDiffEntry[] {
    return this.entries.filter((entry) => entry.status === 'shifted');
  }

  public getReusableRasterCopies(): readonly DocBlockRasterReuse[] {
    return this.entries.filter(isRasterReusableEntry).map((entry) => ({
      id: entry.id,
      index: entry.index,
      source: entry.previous.rect,
      destination: entry.current.rect,
    }));
  }

  public hasChanges(): boolean {
    return this.entries.some((entry) => entry.status !== 'unchanged');
  }
}

function createCurrentEntry(
  previous: DocBlockLayout | null,
  current: DocBlockLayout,
  reflowBlockIds: ReadonlySet<DocNodeId> | undefined,
  repaintBlockIds: ReadonlySet<DocNodeId> | undefined,
): DocBlockLayoutDiffEntry {
  if (!previous) {
    return {
      id: current.id,
      index: current.index,
      status: 'added',
      previous: null,
      current,
      deltaY: 0,
    };
  }

  const deltaY = current.rect.y - previous.rect.y;
  const layoutReusable = hasReusableLayoutShape(previous, current);
  const renderChanged = (reflowBlockIds?.has(current.id) ?? false) || (repaintBlockIds?.has(current.id) ?? false);
  const status: DocBlockLayoutDiffStatus = !layoutReusable || renderChanged ? 'changed' : deltaY === 0 ? 'unchanged' : 'shifted';
  return {
    id: current.id,
    index: current.index,
    status,
    previous,
    current,
    deltaY,
  };
}

function hasReusableLayoutShape(previous: DocBlockLayout, current: DocBlockLayout): boolean {
  return (
    previous.index === current.index &&
    previous.lineEnd - previous.lineStart === current.lineEnd - current.lineStart &&
    previous.rect.x === current.rect.x &&
    previous.rect.width === current.rect.width &&
    previous.rect.height === current.rect.height &&
    previous.flowHeight === current.flowHeight
  );
}

function isChangedEntry(entry: DocBlockLayoutDiffEntry): boolean {
  return entry.status === 'changed' || entry.status === 'added' || entry.status === 'removed';
}

function isRasterReusableEntry(
  entry: DocBlockLayoutDiffEntry,
): entry is DocBlockLayoutDiffEntry & { previous: DocBlockLayout; current: DocBlockLayout } {
  return (
    (entry.status === 'unchanged' || entry.status === 'shifted') &&
    entry.previous !== null &&
    entry.current !== null
  );
}
