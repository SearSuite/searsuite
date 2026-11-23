import { CellMergeRangeIndex } from '../src/CellMergeRangeIndex';
import { type CellMergeBounds } from '../src/CellMergeBounds';

describe('CellMergeRangeIndex', () => {
  it('prunes spatial branches instead of testing every stored merge for each query', () => {
    const ranges = Array.from({ length: 10000 }, (_, index) => ({
      startRow: Math.floor(index / 100) * 5,
      endRow: Math.floor(index / 100) * 5 + 2,
      startColumn: (index % 100) * 5,
      endColumn: (index % 100) * 5 + 2,
    }));
    const index = new CellMergeRangeIndex(ranges);
    interface InspectedBranch {
      startRow: number;
      left?: InspectedBranch;
      right?: InspectedBranch;
    }
    let examined = 0;
    function instrument(branch: InspectedBranch | undefined): void {
      if (!branch) return;
      const startRow = branch.startRow;
      Object.defineProperty(branch, 'startRow', {
        get: () => {
          examined += 1;
          return startRow;
        },
      });
      instrument(branch.left);
      instrument(branch.right);
    }
    instrument((index as unknown as { root: InspectedBranch }).root);
    expect(index.find(252, 252)).toMatchObject(ranges[5050]!);
    expect(examined).toBeGreaterThan(0);
    expect(examined).toBeLessThan(128);
    examined = 0;
    expect(index.find(253, 253)).toBeNull();
    expect(examined).toBeLessThan(128);
  });

  it('matches linear membership across thousands of ranges and inclusive boundaries', () => {
    const ranges: CellMergeBounds[] = [];
    for (let row = 0; row < 100; row += 1) {
      for (let column = 0; column < 100; column += 1) {
        ranges.push({ startRow: row * 5, endRow: row * 5 + 2, startColumn: column * 5, endColumn: column * 5 + 2 });
      }
    }
    const index = new CellMergeRangeIndex(ranges);
    for (let n = 0; n < 1500; n += 1) {
      const row = ((n * 137) % 501) - 1;
      const column = ((n * 73) % 501) - 1;
      const expected = ranges.find(
        (range) =>
          row >= range.startRow && row <= range.endRow && column >= range.startColumn && column <= range.endColumn,
      );
      const actual = index.find(row, column);
      if (expected) expect(actual).toMatchObject(expected);
      else expect(actual).toBeNull();
    }
  });

  it('handles enormous ranges without expanding cells and keeps first-match semantics', () => {
    const ranges = [
      { startRow: 1, endRow: 1048575, startColumn: 1, endColumn: 16383 },
      { startRow: 2, endRow: 3, startColumn: 2, endColumn: 3 },
    ];
    const index = new CellMergeRangeIndex(ranges);
    expect(index.find(3, 3)).toMatchObject(ranges[0]);
    expect(index.find(1048575, 16383)).toMatchObject(ranges[0]);
    expect(index.find(0, 0)).toBeNull();
    expect(index.find(NaN, 2)).toBeNull();
    expect(new CellMergeRangeIndex([]).find(0, 0)).toBeNull();
  });
});
