import { type CellMergeBounds } from './CellMergeBounds';

interface IndexedBounds extends CellMergeBounds {
  readonly order: number;
}

interface Branch extends CellMergeBounds {
  readonly firstOrder: number;
  readonly entry?: IndexedBounds;
  readonly left?: Branch | undefined;
  readonly right?: Branch | undefined;
}

/** Balanced bounding-volume index over actual merges, independent of sheet size. */
export class CellMergeRangeIndex {
  readonly #root: Branch | undefined;

  /** Builds an isolated index without materializing cells covered by a merge. */
  public constructor(ranges: readonly CellMergeBounds[]) {
    this.#root = buildBranch(ranges.map((range, order) => ({ ...range, order })));
  }

  /** Finds membership, preserving matrix traversal order if stored ranges overlap. */
  public find(row: number, column: number): CellMergeBounds | null {
    let result: IndexedBounds | undefined;
    function visit(branch: Branch | undefined): void {
      if (
        !branch ||
        (result && branch.firstOrder >= result.order) ||
        !(row >= branch.startRow && row <= branch.endRow && column >= branch.startColumn && column <= branch.endColumn)
      )
        return;
      if (branch.entry) {
        result = branch.entry;
        return;
      }
      visit(branch.left);
      visit(branch.right);
    }
    visit(this.#root);
    return result ?? null;
  }
}

function buildBranch(entries: IndexedBounds[]): Branch | undefined {
  if (entries.length === 0) return undefined;
  if (entries.length === 1) return { ...entries[0], firstOrder: entries[0].order, entry: entries[0] };
  let startRow = Infinity;
  let startColumn = Infinity;
  let endRow = -Infinity;
  let endColumn = -Infinity;
  let firstOrder = Infinity;
  for (const entry of entries) {
    startRow = Math.min(startRow, entry.startRow);
    startColumn = Math.min(startColumn, entry.startColumn);
    endRow = Math.max(endRow, entry.endRow);
    endColumn = Math.max(endColumn, entry.endColumn);
    firstOrder = Math.min(firstOrder, entry.order);
  }
  const splitRows = endRow - startRow >= endColumn - startColumn;
  entries.sort((a, b) =>
    splitRows
      ? a.startRow + a.endRow - b.startRow - b.endRow || a.order - b.order
      : a.startColumn + a.endColumn - b.startColumn - b.endColumn || a.order - b.order,
  );
  const middle = Math.floor(entries.length / 2);
  return {
    startRow,
    startColumn,
    endRow,
    endColumn,
    firstOrder,
    left: buildBranch(entries.slice(0, middle)),
    right: buildBranch(entries.slice(middle)),
  };
}
