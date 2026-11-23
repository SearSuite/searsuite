import { CSRMatrix } from '@searsuite/sear-domain-matrix';

describe('', () => {
  const len = 100;

  it('CSRMatrix should be a constructor', () => {
    const denseArray = [
      [0, 0, 0, 0, 0, 0, 0, 200, 0, 400, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 400, 200],
    ];
    const data = [200, 400, 400, 200];
    const indices = [0, 4];
    const indptr = [7, 9, 32, 33];
    const numRows = 1;
    // TODO may out range
    const numCols = Math.max(...indptr) + 1;
    const matrix = new CSRMatrix<number>({ data, indices, indptr }, [numRows, numCols]);
    for (let i = 0; i < denseArray[0].length; i++) expect(matrix.getItem(0, i)).toEqual(denseArray[0][i] || null);
    expect(matrix.shape).toEqual([numRows, numCols]);
  });

  it('CSRMatrix should convert from denseArray correctly', () => {
    const denseMatrix = new Array(len).fill(0).map(() => new Array(len).fill(0));
    const matrix = new CSRMatrix<string>();
    matrix.fromDense(denseMatrix);
    expect(matrix.shape).toEqual([len, len]);
  });

  it('CSRMatrix should convert from empty denseArray correctly', () => {
    const denseMatrix = [[]];
    const matrix = new CSRMatrix<string>();
    matrix.fromDense(denseMatrix);
    expect(matrix.shape).toEqual([1, 0]);
  });

  it('CSRMatrix should iterate only stored entries', () => {
    const matrix = new CSRMatrix<string>(
      {
        data: ['A1', 'C1', 'B3'],
        indices: [0, 2, 2, 3],
        indptr: [0, 2, 1],
      },
      [3, 4],
    );
    const entries: Array<{ value: string; row: number; col: number }> = [];

    matrix.forEachStored((value, row, col) => entries.push({ value, row, col }));

    expect(entries).toEqual([
      { value: 'A1', row: 0, col: 0 },
      { value: 'C1', row: 0, col: 2 },
      { value: 'B3', row: 2, col: 1 },
    ]);
  });

  it('CSRMatrix should iterate stored entries in one row without scanning columns', () => {
    const matrix = new CSRMatrix<string>(
      { data: ['A1', 'C1', 'B3'], indices: [0, 2, 2, 3], indptr: [0, 2, 1] },
      [3, 4],
    );
    const entries: Array<{ value: string; col: number }> = [];

    matrix.forEachStoredInRow(0, (value, col) => entries.push({ value, col }));

    expect(entries).toEqual([
      { value: 'A1', col: 0 },
      { value: 'C1', col: 2 },
    ]);
  });

  it('visits a bounded sparse rectangle without probing a million empty rows', () => {
    const matrix = new CSRMatrix<string>(void 0, [1_000_000, 4]);
    matrix.addItem(3, 0, 'outside-column');
    matrix.addItem(500_000, 2, 'middle');
    matrix.addItem(999_999, 2, 'last');
    let pointerReads = 0;
    const pointers = (matrix as unknown as { indices: number[] }).indices;
    (matrix as unknown as { indices: number[] }).indices = new Proxy(pointers, {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) pointerReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const entries: Array<[string, number, number]> = [];
    matrix.forEachStoredInRange(0, 2, 999_999, 2, (value, row, column) => entries.push([value, row, column]));

    expect(entries).toEqual([['middle', 500_000, 2], ['last', 999_999, 2]]);
    expect(pointerReads).toBeLessThan(100);
    expect(() => matrix.forEachStoredInRange(-1, 0, 1, 1, () => {})).toThrow('Index out of bounds');
  });

  it('CSRMatrix should return default after setDefault correctly', () => {
    const defaultValue = {};
    const matrix = new CSRMatrix<typeof defaultValue>();
    matrix.setDefaultValue(defaultValue);
    matrix.fromDense([[defaultValue]]);
    matrix.removeItem(0, 0);
    expect(matrix.getItem(0, 0)).toEqual(defaultValue);
  });

  it('CSRMatrix should support writes to an empty matrix constructed with a shape', () => {
    const matrix = new CSRMatrix<number>(void 0, [3, 2]);
    matrix.setDefaultValue(10);

    matrix.addItem(2, 1, 42);

    expect(matrix.getItem(2, 1)).toBe(42);
    expect(matrix.getItem(0, 0)).toBe(10);
  });

  it('CSRMatrix should not overwrite a later row when inserting the same column into an earlier row', () => {
    const matrix = new CSRMatrix<string>(void 0, [5, 2]);
    matrix.addItem(4, 0, 'later');
    matrix.addItem(0, 0, 'earlier');

    expect(matrix.getItem(0, 0)).toBe('earlier');
    expect(matrix.getItem(4, 0)).toBe('later');
    matrix.addItem(0, 0, 'updated');
    expect(matrix.getItem(0, 0)).toBe('updated');
    expect(matrix.getItem(4, 0)).toBe('later');
  });

  it('CSRMatrix should clone stored data, shape, and default value', () => {
    const matrix = new CSRMatrix<number>(void 0, [2, 2]);
    matrix.setDefaultValue(7);
    matrix.addItem(0, 1, 42);

    const clone = matrix.clone();
    matrix.addItem(0, 1, 99);

    expect(clone).toBeInstanceOf(CSRMatrix);
    expect(clone.shape).toEqual([2, 2]);
    expect(clone.getItem(0, 1)).toBe(42);
    expect(clone.getItem(1, 1)).toBe(7);
  });

  it('CSRMatrix should clone matrices without a default value', () => {
    const matrix = new CSRMatrix<number>(void 0, [1, 1]);
    matrix.addItem(0, 0, 11);

    const clone = matrix.clone();
    matrix.removeItem(0, 0);

    expect(clone.getItem(0, 0)).toBe(11);
    expect(matrix.getItem(0, 0)).toBeNull();
  });

  it('does not let a retained committed matrix handle replace its read behavior', () => {
    const matrix = new CSRMatrix<string>(void 0, [1, 1]);
    matrix.addItem(0, 0, 'before');
    matrix.lockMutations();

    expect(() => { (matrix as unknown as { getItem: () => string }).getItem = () => 'forged'; }).toThrow();
    expect(() => Object.setPrototypeOf(matrix, { getItem: () => 'forged' })).toThrow();
    expect(matrix.getItem(0, 0)).toBe('before');

    const staged = matrix.clone();
    staged.addItem(0, 0, 'after');
    expect(staged.getItem(0, 0)).toBe('after');
  });

  it('rejects committed function values that retain mutable closures', () => {
    const matrix = new CSRMatrix<() => void>(void 0, [1, 1]);
    matrix.addItem(0, 0, () => void 0);

    expect(() => matrix.lockMutations()).toThrow('functions');
  });

  it('detaches mutable stored and default values for session snapshots', () => {
    const matrix = new CSRMatrix<{ nested: { value: number } }>(void 0, [2, 2]);
    matrix.setDefaultValue({ nested: { value: 3 } });
    matrix.addItem(0, 1, { nested: { value: 1 } });

    const snapshot = matrix.cloneDetached((value) => ({ nested: { ...value.nested } }));
    snapshot.getItem(0, 1)!.nested.value = 8;
    snapshot.getItem(1, 1)!.nested.value = 9;

    expect(matrix.getItem(0, 1)?.nested.value).toBe(1);
    expect(matrix.getItem(1, 1)?.nested.value).toBe(3);
  });

  it('CSRMatrix should clone subclass storage without rebuilding entries through the constructor', () => {
    class RebuildingMatrix extends CSRMatrix<number> {
      public static reconstructedEntries = 0;

      public constructor(
        data: { data: number[]; indices: number[]; indptr: number[] } = {
          data: [],
          indices: [0],
          indptr: [],
        },
        shape: [number, number] = [0, 0],
      ) {
        super(void 0, shape);
        for (let row = 0; row < shape[0]; row += 1) {
          for (let index = data.indices[row] ?? 0; index < (data.indices[row + 1] ?? 0); index += 1) {
            const value = data.data[index];
            const column = data.indptr[index];
            if (value !== undefined && column !== undefined) {
              RebuildingMatrix.reconstructedEntries += 1;
              super.addItem(row, column, value);
            }
          }
        }
      }
    }

    const matrix = new RebuildingMatrix(void 0, [2, 2]);
    matrix.addItem(0, 1, 4);
    matrix.addItem(1, 0, 8);
    RebuildingMatrix.reconstructedEntries = 0;

    const clone = matrix.clone();

    expect(RebuildingMatrix.reconstructedEntries).toBe(0);
    expect(clone).toBeInstanceOf(RebuildingMatrix);
    expect(clone.getItem(0, 1)).toBe(4);
    expect(clone.getItem(1, 0)).toBe(8);
    matrix.addItem(0, 1, 16);
    expect(clone.getItem(0, 1)).toBe(4);
  });

  it('stages independent sparse arrays without invoking subclass clone hooks', () => {
    class SharedStorageMatrix extends CSRMatrix<number> {
      public override clone(): this {
        const copy = super.clone();
        copy.indices = this.indices;
        return copy;
      }
    }
    const matrix = new SharedStorageMatrix(void 0, [1, 1]);
    matrix.addItem(0, 0, 4);

    const copy = CSRMatrix.prototype.cloneForStaging.call(matrix);
    copy.addItem(0, 0, 9);

    expect(copy.getItem(0, 0)).toBe(9);
    expect(matrix.getItem(0, 0)).toBe(4);
  });

  it('does not carry subclass private fields into staged state', () => {
    class OpaqueMatrix extends CSRMatrix<number> {
      #hidden = 1;
      public readHidden(): number { return this.#hidden; }
    }
    const matrix = new OpaqueMatrix(void 0, [1, 1]);

    const copy = CSRMatrix.prototype.cloneForStaging.call(matrix) as OpaqueMatrix;

    expect(matrix.readHidden()).toBe(1);
    expect(() => copy.readHidden()).toThrow();
  });

  it('reuses adopted sparse values when a later transaction leaves them unchanged', () => {
    const matrix = new CSRMatrix<{ value: number }>(void 0, [1, 1]);
    matrix.addItem(0, 0, { value: 1 });
    matrix.lockMutations();
    const committed = matrix.getItem(0, 0);

    const staged = CSRMatrix.prototype.cloneForStaging.call(matrix);
    staged.lockMutations();

    expect(staged.getItem(0, 0)).toBe(committed);
  });

  it('locks new values while reusing previously adopted values', () => {
    const matrix = new CSRMatrix<{ value: number }>(void 0, [1, 2]);
    matrix.addItem(0, 0, { value: 1 });
    matrix.lockMutations();
    const committed = matrix.getItem(0, 0);
    const retained = { value: 2 };

    const staged = CSRMatrix.prototype.cloneForStaging.call(matrix);
    staged.addItem(0, 1, retained);
    staged.lockMutations();

    expect(staged.getItem(0, 0)).toBe(committed);
    expect(staged.getItem(0, 1)).toEqual({ value: 2 });
    expect(() => { retained.value = 3; }).toThrow();
    expect(() => { staged.getItem(0, 1)!.value = 3; }).toThrow();
  });

  it('detaches retained sparse arrays with accessor-backed entries at commit', () => {
    const external = { value: 4, column: 0, rowEnd: 1 };
    const data = [4];
    const indices = [0, 1];
    const indptr = [0];
    Object.defineProperty(data, 0, { get: () => external.value, configurable: true });
    Object.defineProperty(indptr, 0, { get: () => external.column, configurable: true });
    const matrix = new CSRMatrix<number>({ data, indices, indptr }, [1, 2]);
    Object.defineProperty((matrix as unknown as { indices: number[] }).indices, 1, {
      get: () => external.rowEnd,
      configurable: true,
    });

    matrix.lockMutations();
    external.value = 9;
    external.column = 1;
    external.rowEnd = 0;

    expect(matrix.getItem(0, 0)).toBe(4);
    expect(matrix.getItem(0, 1)).toBeNull();
    expect(() => matrix.addItem(0, 1, 8)).toThrow('Committed matrix state');
  });

  it('detaches a staged sparse array if a plugin replaces an entry with an accessor', () => {
    const matrix = new CSRMatrix<number>(void 0, [1, 1]);
    matrix.addItem(0, 0, 4);
    matrix.lockMutations();
    const staged = CSRMatrix.prototype.cloneForStaging.call(matrix);
    const external = { value: 4 };
    Object.defineProperty((staged as unknown as { data: number[] }).data, 0, {
      get: () => external.value,
      configurable: true,
    });

    staged.lockMutations();
    external.value = 9;

    expect(staged.getItem(0, 0)).toBe(4);
  });

  it('rejects object-backed sparse coordinates that can change after commit', () => {
    const external = { end: 1 };
    const end = { valueOf: () => external.end } as unknown as number;
    const matrix = new CSRMatrix<number>({ data: [4], indices: [0, end], indptr: [0] }, [1, 1]);

    expect(() => matrix.lockMutations()).toThrow('sparse coordinates');
  });

  it('rejects mutable runtime metadata shared by committed matrix views', () => {
    const matrix = new CSRMatrix<number>(void 0, [1, 1]);
    (matrix as unknown as { name: unknown }).name = { value: 'external' };

    expect(() => matrix.lockMutations()).toThrow('matrix metadata');

    const other = new CSRMatrix<number>(void 0, [1, 1]);
    (other as unknown as { ndim: unknown }).ndim = { valueOf: () => 2 };
    expect(() => other.lockMutations()).toThrow('matrix metadata');
  });

  it('CSRMatrix should get elements correctly', () => {
    const denseMatrix = new Array(len).fill(0).map(() => new Array(len).fill(0));
    const matrix = new CSRMatrix<string>();
    for (let i = 0; i < len; i++) {
      denseMatrix[0][i] = String(i);
      denseMatrix[i][0] = String(i);
      denseMatrix[i][i] = String(i * i);
    }
    matrix.fromDense(denseMatrix);
    for (let i = 0; i < len; i++) {
      expect(matrix.getItem(0, i)).toEqual(String(i));
      expect(matrix.getItem(i, 0)).toEqual(String(i));
      expect(matrix.getItem(i, i)).toEqual(String(i * i));
    }

    const matrix2 = new CSRMatrix<number>();
    const denseArray = [
      [8, null, 2, null, null],
      [null, null, 5, null, null],
      [null, null, null, null, null],
      [null, null, null, null, null],
      [null, null, 7, 1, 2],
      [null, null, null, null, null],
      [null, null, null, 9, null],
    ];
    matrix2.fromDense(denseArray);
    expect(matrix2.getItem(0, 0)).toEqual(denseArray[0][0]);
    expect(matrix2.getItem(0, 2)).toEqual(denseArray[0][2]);
    expect(matrix2.getItem(1, 2)).toEqual(denseArray[1][2]);

    expect(matrix2.getItem(4, 2)).toEqual(denseArray[4][2]);
    expect(matrix2.getItem(4, 3)).toEqual(denseArray[4][3]);
    expect(matrix2.getItem(4, 4)).toEqual(denseArray[4][4]);
    expect(matrix2.getItem(6, 3)).toEqual(denseArray[6][3]);
  });

  it('CSRMatrix should add elements correctly', () => {
    const denseMatrix = new Array(len).fill(0).map(() => new Array(len).fill(0));
    const matrix = new CSRMatrix<string>();
    matrix.fromDense(denseMatrix);
    for (let i = 0; i < len; i++) {
      matrix.addItem(len - 1, i, String(i));
      matrix.addItem(i, len - 1, String(i));
    }
    for (let i = 0; i < len; i++) {
      expect(matrix.getItem(len - 1, i)).toEqual(String(i));
      expect(matrix.getItem(i, len - 1)).toEqual(String(i));
    }
  });

  it('CSRMatrix should remove elements correctly', () => {
    const denseMatrix = new Array(len).fill(0).map(() => new Array(len).fill(0));
    const matrix = new CSRMatrix<string>();
    for (let i = 0; i < len; i++) {
      denseMatrix[0][i] = String(i);
      denseMatrix[i][0] = String(i);
      denseMatrix[i][i] = String(i * i);
    }
    matrix.fromDense(denseMatrix);
    for (let i = 0; i < len; i++) {
      matrix.removeItem(0, i);
      matrix.removeItem(i, 0);
      matrix.removeItem(i, i);
    }
    for (let i = 0; i < len; i++) {
      expect(matrix.getItem(0, i)).toEqual(null);
      expect(matrix.getItem(i, 0)).toEqual(null);
      expect(matrix.getItem(i, i)).toEqual(null);
    }
  });

  it('CSRMatrix should addColumn correctly', () => {
    const matrix = new CSRMatrix<number>();
    matrix.fromDense([
      [8, 0, 2, 0, 0],
      [0, 0, 5, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 7, 1, 2],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 9, 0],
    ]);

    expect(() => matrix.addColumn(matrix.shape[1], [])).toThrow(
      'Number of inserted col elements must equal current numRows.',
    );

    matrix.addColumn(matrix.shape[1], [11, 22, 33, null, 55, 66, 77]);

    expect(matrix.shape).toEqual([7, 6]);
    const CSRMatrixNumber = 88888888;
    matrix.addItem(3, 3, CSRMatrixNumber);
    expect(matrix.getItem(3, 3)).toEqual(CSRMatrixNumber);
  });

  it('CSRMatrix should addColumn in target index correctly', () => {
    const matrix = new CSRMatrix<number>();
    matrix.fromDense([
      [8, 0, 2, 0, 0],
      [0, 0, 5, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 7, 1, 2],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 9, 0],
    ]);

    const expectArray1 = [
      [8, null, 2, 11, null, null],
      [null, null, 5, 22, null, null],
      [null, null, null, 33, null, null],
      [null, null, null, null, null, null],
      [null, null, 7, 55, 1, 2],
      [null, null, null, 66, null, null],
      [null, null, null, 77, 9, null],
    ];

    matrix.addColumn(3, [11, 22, 33, null, 55, 66, 77]);
    expect(matrix.toArray()).toEqual(expectArray1);

    const expectArray2 = [
      [111, 8, null, 2, 11, null, null],
      [222, null, null, 5, 22, null, null],
      [333, null, null, null, 33, null, null],
      [444, null, null, null, null, null, null],
      [555, null, null, 7, 55, 1, 2],
      [666, null, null, null, 66, null, null],
      [null, null, null, null, 77, 9, null],
    ];
    matrix.addColumn(0, [111, 222, 333, 444, 555, 666, null]);
    expect(matrix.toArray()).toEqual(expectArray2);
  });

  it('CSRMatrix should delete one column correctly', () => {
    const matrix = new CSRMatrix<number>();
    matrix.fromDense([
      [8, null, 2, null, null],
      [null, null, 5, null, null],
      [null, null, null, null, null],
      [null, null, null, null, null],
      [null, null, 7, 1, 2],
      [null, null, null, null, null],
      [null, null, null, 9, null],
    ]);

    const expectArray = [
      [8, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, 1, 2],
      [null, null, null, null],
      [null, null, 9, null],
    ];

    expect(() => matrix.deleteColumns(5)).toThrow('NumDeleteColumns out of bounds');

    matrix.deleteColumns(2);
    expect(matrix.toArray()).toEqual(expectArray);
  });

  it('CSRMatrix should support move column correctly', () => {
    const denseArray = [
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      [null, 11, null, 22, null, 33, 44, null, null],
      [9, 8, 7, 6, 5, 4, 3, 2, 1],
      [null, null, null, 33, null, 22, null, 11, null],
    ];
    const matrix = new CSRMatrix<number | null>();
    matrix.fromDense(denseArray);
    const expectArray = [
      [9, 8, 3, 4, 5, 6, 7, 2, 1],
      [null, null, null, 22, null, 33, 44, 11, null],
      [1, 2, 7, 6, 5, 4, 3, 8, 9],
      [null, 11, null, 33, null, 22, null, null, null],
    ];
    matrix.swapColumn(0, 8);
    matrix.swapColumn(7, 1);
    matrix.swapColumn(3, 3);

    expect(matrix.toArray()).toEqual(expectArray);
  });

  it('CSRMatrix should addRow correctly', () => {
    const denseMatrix = new Array(len).fill(0).map(() => new Array(len).fill(0));
    const matrix = new CSRMatrix<string>();
    matrix.fromDense(denseMatrix);

    matrix.addRow(matrix.shape[0], Array(len).fill(null));
    expect(matrix.shape).toEqual([len + 1, len]);
    const CSRMatrixString = 'CSRMatrix';
    matrix.addItem(len, 0, CSRMatrixString);
    expect(matrix.getItem(len, 0)).toEqual(CSRMatrixString);
  });

  it('CSRMatrix should addRow before target index correctly', () => {
    const denseArray = [
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      [9, 8, 7, 6, 5, 4, 3, 2, 1],
    ];
    const matrix = new CSRMatrix<number | null>();
    matrix.fromDense(denseArray);

    const expectArray = [
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      [null, null, null, null, null, null, null, null, null],
      [9, 8, 7, 6, 5, 4, 3, 2, 1],
      [null, null, null, null, null, null, null, null, null],
    ];

    expect(() => matrix.addRow(1, new Array(denseArray[0].length + 1).fill(null))).toThrow(
      'Number of inserted row elements must equal current numCols.',
    );

    expect(() => matrix.addRow(1, new Array(denseArray[0].length - 1).fill(null))).toThrow(
      'Number of inserted row elements must equal current numCols.',
    );

    matrix.addRow(1, new Array(denseArray[0].length).fill(null));
    matrix.addRow(matrix.shape[0], new Array(denseArray[0].length).fill(null));
    // case 1: check shape
    expect(matrix.shape).toEqual([4, 9]);
    // case 2: check dense array
    expect(matrix.toArray()).toEqual(expectArray);
    // case 3: check value
    matrix.addRow(1, [null, null, null, null, 999, null, null, null, null]);
    expect(matrix.getItem(1, 4)).toEqual(999);
  });

  it('CSRMatrix should deleteRows one row correctly', () => {
    const matrix = new CSRMatrix<number | null>();
    matrix.fromDense([
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      [null, 11, null, 22, null, 33, null, 44, null],
      [9, 8, 7, 6, 5, 4, 3, 2, 1],
      [null, 55, null, 66, null, 77, null, 88, null],
    ]);

    const expectArray = [[9, 8, 7, 6, 5, 4, 3, 2, 1]];

    matrix.deleteRows(1);
    matrix.deleteRows(2);
    matrix.deleteRows(0);

    expect(matrix.toArray()).toEqual(expectArray);
  });

  it('CSRMatrix should deleteRows multiple rows correctly', () => {
    const matrix = new CSRMatrix<number | null>();
    matrix.fromDense([
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      [null, 11, null, 22, null, 33, null, 44, null],
      [9, 8, 7, 6, 5, 4, 3, 2, 1],
      [null, 55, null, 66, null, 77, null, 88, null],
    ]);

    const expectArray = [[1, 2, 3, 4, 5, 6, 7, 8, 9]];

    expect(() => matrix.deleteRows(1, 6)).toThrow('NumDeleteRows out of bounds');

    matrix.deleteRows(1, 3);
    expect(matrix.toArray()).toEqual(expectArray);
  });

  it('CSRMatrix should support move row correctly', () => {
    const denseArray = [
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      [null, 11, null, 22, null, 33, null, 44, null],
      [9, 8, 7, 6, 5, 4, 3, 2, 1],
      [null, 44, null, 33, null, 22, null, 11, null],
    ];
    const matrix = new CSRMatrix<number | null>();
    matrix.fromDense(denseArray);

    const expectArray = [
      [null, 11, null, 22, null, 33, null, 44, null],
      [null, 44, null, 33, null, 22, null, 11, null],
      [9, 8, 7, 6, 5, 4, 3, 2, 1],
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
    ];

    expect(() => matrix.swapRow(-1, 3)).toThrow('Index out of bounds');

    matrix.swapRow(0, 1);
    matrix.swapRow(3, 1);
    matrix.swapRow(2, 2);

    expect(matrix.toArray()).toEqual(expectArray);
  });

  it('CSRMatrix should support apply correctly', () => {
    const denseArray = [
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      [null, 11, null, 22, null, 33, null, 44, null],
      [9, 8, 7, 6, 5, 4, 3, 2, 1],
      [null, 44, null, 33, null, 22, null, 11, null],
    ];
    const matrix = new CSRMatrix<number | null>();
    matrix.fromDense(denseArray);

    const expectArray = [
      [null, 11, null, 22, null, 33, null, 44, null],
      [null, 44, null, 33, null, 22, null, 11, null],
      [9, 8, 7, 6, 5, 4, 3, 2, 1],
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
    ];

    matrix.dispatch([{ p: [0], rm: [1] }]);
    matrix.dispatch([{ p: [3], rm: [1] }]);
    matrix.dispatch([{ p: [2], rm: [2] }]);

    expect(matrix.toArray()).toEqual(expectArray);
  });

  it('CSRMatrix should support iterate over all elements including zeros correctly', () => {
    const matrix = new CSRMatrix<number>();
    matrix.fromDense([
      [1, 0, 4],
      [0, 2, 0],
      [0, 0, 3],
    ]);

    const expectedValues = [
      { value: 1, row: 0, col: 0 },
      { value: null, row: 0, col: 1 },
      { value: 4, row: 0, col: 2 },
      { value: null, row: 1, col: 0 },
      { value: 2, row: 1, col: 1 },
      { value: null, row: 1, col: 2 },
      { value: null, row: 2, col: 0 },
      { value: null, row: 2, col: 1 },
      { value: 3, row: 2, col: 2 },
    ];

    const result: { value: number | null; row: number; col: number }[] = [];

    matrix.forEach((value, row, col) => result.push({ value, row, col }));

    expect(result).toEqual(expectedValues);
  });

  it('CSRMatrix should notify listeners on addItem, updateItem, and removeItem changes correctly', () => {
    const denseMatrix = new Array(len).fill(0).map(() => new Array(len).fill(0));
    const matrix = new CSRMatrix<number>();
    const listener = jest.fn();
    matrix.addListener(listener);

    matrix.fromDense(denseMatrix);
    matrix.addItem(0, 1, 5);
    matrix.removeItem(0, 1);

    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('CSRMatrix should remove listeners correctly', () => {
    const denseMatrix = new Array(len).fill(0).map(() => new Array(len).fill(0));
    const matrix = new CSRMatrix<number>();
    const listener = jest.fn();
    matrix.addListener(listener);

    matrix.fromDense(denseMatrix);
    matrix.addItem(0, 1, 5);
    matrix.removeListener(listener);
    matrix.removeItem(0, 1);

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('CSRMatrix should support addItem from a empty matrix and update numRows & numCols correctly', () => {
    const matrix = new CSRMatrix<{}>();

    for (let i = 0; i < len; i++) {
      matrix.addItem(i, i, {});
    }

    expect(matrix.shape).toEqual([len, len]);
  });

  it('CSRMatrix should support convert to a denseArray correctly', () => {
    const matrix = new CSRMatrix<number>();
    const expextValue = new Array(len).fill(null).map(() => new Array(len).fill(null));

    for (let i = 0; i < len; i++) {
      matrix.addItem(i, i, i + 1);
      expextValue[i][i] = i + 1;
    }
    expect(matrix.toArray()).toEqual(expextValue);
  });

  it('CSRMatrix should throw error for out of bounds access', () => {
    const denseMatrix = new Array(len).fill(0).map(() => new Array(len).fill(0));
    const matrix = new CSRMatrix<number>();
    matrix.fromDense(denseMatrix);

    expect(() => matrix.addItem(-1, 0, 5)).toThrow(`Invalid row index ${-1}`);
    expect(() => matrix.addItem(1, -10, 5)).toThrow(`Invalid col index ${-10}`);
    expect(() => matrix.removeItem(denseMatrix.length, 0)).toThrow('Index out of bounds');
  });

  it('CSRMatrix constructor with empty indices array defaults lastPointer to 0', () => {
    const matrix = new CSRMatrix<number>({ data: [], indices: [], indptr: [] }, [2, 2]);
    matrix.addItem(1, 1, 42);
    expect(matrix.getItem(1, 1)).toBe(42);
  });

  it('CSRMatrix forEachStoredInRow throws on out of bounds row', () => {
    const matrix = new CSRMatrix<number>(undefined, [2, 2]);
    expect(() => matrix.forEachStoredInRow(3, () => {})).toThrow();
    expect(() => matrix.forEachStoredInRow(-1, () => {})).toThrow();
  });
});
