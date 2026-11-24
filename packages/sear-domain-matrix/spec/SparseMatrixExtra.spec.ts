import { SparseMatrix } from '../src/SparseMatrix';

class MockMatrix extends SparseMatrix<number> {
  #data: Map<string, number> = new Map();

  constructor(rows: number, cols: number) {
    super(rows, cols);
  }

  public setItem(row: number, col: number, value: number) {
    this.#data.set(`${row},${col}`, value);
  }

  public override getItem(row: number, col: number): number | null {
    const val = this.#data.get(`${row},${col}`);
    return val !== undefined ? val : null;
  }

  public override toArray(): number[][] {
    return [];
  }
}

describe('SparseMatrix base methods', () => {
  it('covers forEachStored and forEachStoredInRow', () => {
    const matrix = new MockMatrix(2, 2);
    matrix.setItem(0, 1, 10);
    matrix.setItem(1, 0, 20);

    const stored: Array<{ v: number; r: number; c: number }> = [];
    matrix.forEachStored((val, r, c) => {
      stored.push({ v: val, r, c });
    });

    expect(stored).toHaveLength(2);
    expect(stored).toContainEqual({ v: 10, r: 0, c: 1 });
    expect(stored).toContainEqual({ v: 20, r: 1, c: 0 });

    const rowStored: Array<{ v: number; c: number }> = [];
    matrix.forEachStoredInRow(0, (val, c) => {
      rowStored.push({ v: val, c });
    });
    expect(rowStored).toHaveLength(1);
    expect(rowStored).toContainEqual({ v: 10, c: 1 });
  });
});

class DefaultMatrix extends SparseMatrix<number> {
  constructor() {
    super();
  }
  toArray() {
    return [];
  }
}

describe('SparseMatrix default constructor', () => {
  it('uses default values 0, 0', () => {
    const m = new DefaultMatrix();
    expect(m.shape).toEqual([0, 0]);
  });
});
