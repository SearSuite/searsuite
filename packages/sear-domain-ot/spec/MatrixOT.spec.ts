import { CSRMatrix } from '@searsuite/sear-domain-matrix';
import { DenseMatrixOTSnapshot } from '../src/DenseMatrixOTSnapshot';
import {
  BaseOT,
  OTTransformPriority,
  type OTOperation,
  MatrixOT,
  createMoveRowOTOperation,
  createMoveColOTOperation,
  createInsertRowOTOperation,
  createInsertColOTOperation,
  isMatrixStructureOperation,
  isResizeColOperation,
  isResizeRowOperation,
  isUpdateCellOperation,
  type MatrixOTOperation,
  type InsertRowOTOperation,
  type InsertColOTOperation,
  type UpdateCellOTOperation,
} from '../src';

describe('MatrixOT sanity cases', () => {
  expect(new MatrixOT().name).toEqual('MatrixOT');
  it('MatrixOT create should return an empty operation list', () => {
    expect(MatrixOT.create()).toEqual([]);
    expect(MatrixOT.create([{ p: [0] }])).toEqual([{ p: [0] }]);
  });
});

describe('MatrixOT operation guards', () => {
  const updateCellOperation: MatrixOTOperation<number> = {
    p: [1, 2],
    uc: { value: 3, prev: 2 },
  };
  const resizeRowOperation: MatrixOTOperation<number> = {
    p: [1],
    rr: { value: 24, prev: 20 },
  };
  const resizeColOperation: MatrixOTOperation<number> = {
    p: [2],
    rc: { value: 80, prev: 72 },
  };
  const structureOperations: MatrixOTOperation<unknown>[] = [
    { p: [0], ri: [] },
    { p: [0], rd: [] },
    { p: [0], rm: [1] },
    { p: [0], ci: [] },
    { p: [0], cd: [] },
    { p: [0], cm: [1] },
  ];

  it('narrows update-cell and resize operations', () => {
    expect(isUpdateCellOperation<number>(updateCellOperation)).toBe(true);
    expect(isUpdateCellOperation<number>(resizeRowOperation)).toBe(false);
    expect(isResizeRowOperation(resizeRowOperation)).toBe(true);
    expect(isResizeRowOperation(resizeColOperation)).toBe(false);
    expect(isResizeColOperation(resizeColOperation)).toBe(true);
    expect(isResizeColOperation(updateCellOperation)).toBe(false);
  });

  it('recognizes every matrix structure operation', () => {
    structureOperations.forEach((operation) => expect(isMatrixStructureOperation(operation)).toBe(true));
    expect(isMatrixStructureOperation(updateCellOperation)).toBe(false);
  });

  it('rejects operation keys whose payload is absent', () => {
    const operations = [
      { p: [0], uc: void 0 },
      { p: [0], rr: void 0 },
      { p: [0], rc: void 0 },
      { p: [0], ri: void 0 },
      { p: [0], rd: void 0 },
      { p: [0], rm: void 0 },
      { p: [0], ci: void 0 },
      { p: [0], cd: void 0 },
      { p: [0], cm: void 0 },
    ] as unknown as OTOperation[];

    expect(isUpdateCellOperation(operations[0])).toBe(false);
    expect(isResizeRowOperation(operations[1])).toBe(false);
    expect(isResizeColOperation(operations[2])).toBe(false);
    operations.slice(3).forEach((operation) => expect(isMatrixStructureOperation(operation)).toBe(false));
  });
});

describe('MatrixOT lists cases', () => {
  describe('MatrixOT lists apply', () => {
    it('mutates dense snapshots used for deleted payload rebasing', () => {
      const snapshot = new DenseMatrixOTSnapshot<string | undefined>().fromDense([
        ['A', 'B'],
        ['C', null],
      ]);

      snapshot.addColumn(1, ['X', void 0, 'Y']);
      snapshot.swapColumn(0, 2);
      snapshot.deleteColumns(1, 1);
      snapshot.addItem(3, 1, 'Z');
      snapshot.removeItem(9, 9);
      snapshot.addRow(1, ['R']);
      snapshot.swapRow(0, 1);
      snapshot.deleteRows(1, 1);
      snapshot.swapColumn(4, 0);

      expect(snapshot.toArray()).toEqual([
        [null, void 0, void 0, void 0, 'R'],
        [null, 'C', void 0, void 0, null],
        [null, 'Y', void 0, void 0, null],
        [null, 'Z', void 0, void 0, null],
      ]);
    });

    it('MatrixOT should update cell correctly', () => {
      const matrix = new CSRMatrix<number>();
      matrix.fromDense([
        [1, 2, 3, 4, 5, 6, 7, 8, 9],
        [null, null, null, null, null, null, null, null, null],
        [9, 8, 7, 6, 5, 4, 3, 2, 1],
      ]);
      const updateCellOperation: UpdateCellOTOperation<number | null>[] = [
        {
          p: [1, 4],
          uc: {
            value: 9999,
            prev: null,
          },
        },
        {
          p: [0, 0],
          uc: {
            value: null,
            prev: 1,
          },
        },
      ];
      expect(MatrixOT.apply<number | null, CSRMatrix<number>>(matrix, updateCellOperation)).toEqual(
        new CSRMatrix().fromDense([
          [null, 2, 3, 4, 5, 6, 7, 8, 9],
          [null, null, null, null, 9999, null, null, null, null],
          [9, 8, 7, 6, 5, 4, 3, 2, 1],
        ]),
      );
    });

    it('MatrixOT should insert row correctly', () => {
      const matrix = new CSRMatrix<number>();
      matrix.fromDense([
        [1, 2, 3, 4, 5, 6, 7, 8, 9],
        [9, 8, 7, 6, 5, 4, 3, 2, 1],
      ]);
      const insertRowOperation: InsertRowOTOperation<number | null>[] = [
        {
          p: [1],
          ri: Array(9).fill(null),
        },
      ];
      expect(MatrixOT.apply<number | null, CSRMatrix<number>>(matrix, insertRowOperation)).toEqual(
        new CSRMatrix().fromDense([
          [1, 2, 3, 4, 5, 6, 7, 8, 9],
          [null, null, null, null, null, null, null, null, null],
          [9, 8, 7, 6, 5, 4, 3, 2, 1],
        ]),
      );
    });
    it('MatrixOT should insert col correctly', () => {
      const matrix = new CSRMatrix<number>();
      matrix.fromDense([
        [1, 2, 3, 4, 5, 6, 7, 8, 9],
        [9, 8, 7, 6, 5, 4, 3, 2, 1],
      ]);
      const insertRowOperation: InsertColOTOperation<number | null>[] = [
        {
          p: [3],
          ci: [9999, 9999],
        },
      ];
      expect(MatrixOT.apply<number | null, CSRMatrix<number>>(matrix, insertRowOperation)).toEqual(
        new CSRMatrix().fromDense([
          [1, 2, 3, 9999, 4, 5, 6, 7, 8, 9],
          [9, 8, 7, 9999, 6, 5, 4, 3, 2, 1],
        ]),
      );
    });

    it('MatrixOT should delete row correctly', () => {
      expect(
        MatrixOT.apply<number | null, CSRMatrix<number>>(
          new CSRMatrix<number>().fromDense([
            [1, 2, 3, 4, 5, 6, 7, 8, 9],
            [null, 11, null, 22, null, 33, null, 44, null],
            [9, 8, 7, 6, 5, 4, 3, 2, 1],
          ]),
          [
            {
              p: [0],
              rd: [null, 11, null, 22, null, 33, null, 44, null],
            },
          ],
        ).toArray(),
      ).toEqual([
        [null, 11, null, 22, null, 33, null, 44, null],
        [9, 8, 7, 6, 5, 4, 3, 2, 1],
      ]);

      expect(
        MatrixOT.apply<number | null, CSRMatrix<number | null>>(
          new CSRMatrix<number | null>().fromDense([
            [1, 2, 3, 4, 5, 6, 7, 8, 9],
            [null, 11, null, 22, null, 33, null, 44, null],
            [9, 8, 7, 6, 5, 4, 3, 2, 1],
          ]),
          [
            {
              p: [1],
              rd: [null, 11, null, 22, null, 33, null, 44, null],
            },
          ],
        ).toArray(),
      ).toEqual([
        [1, 2, 3, 4, 5, 6, 7, 8, 9],
        [9, 8, 7, 6, 5, 4, 3, 2, 1],
      ]);
    });
    it('MatrixOT should delete col correctly', () => {
      expect(
        MatrixOT.apply<number | null, CSRMatrix<number | null>>(
          new CSRMatrix<number | null>().fromDense([
            [1, 2, 3, 4, 5, 6, 7, 8, 9],
            [null, 11, null, 22, null, 33, null, 44, null],
            [9, 8, 7, 6, 5, 4, 3, 2, 1],
          ]),
          [
            {
              p: [1],
              cd: [2, null, 8],
            },
          ],
        ).toArray(),
      ).toEqual([
        [1, 3, 4, 5, 6, 7, 8, 9],
        [null, null, 22, null, 33, null, 44, null],
        [9, 7, 6, 5, 4, 3, 2, 1],
      ]);

      expect(
        MatrixOT.apply<number | null, CSRMatrix<number | null>>(
          new CSRMatrix<number | null>().fromDense([
            [1, 2, 3, 4, 5, 6, 7, 8, 9],
            [9, 8, 7, 6, 5, 4, 3, 2, 1],
          ]),
          [
            {
              p: [1],
              cd: [2, 8],
            },
          ],
        ).toArray(),
      ).toEqual([
        [1, 3, 4, 5, 6, 7, 8, 9],
        [9, 7, 6, 5, 4, 3, 2, 1],
      ]);
    });

    it('MatrixOT should move row correctly', () => {
      expect(
        MatrixOT.apply<number | null, CSRMatrix<number | null>>(
          new CSRMatrix<number | null>().fromDense([
            [1, 2, 3, 4, 5, 6, 7, 8, 9],
            [null, 11, null, 22, null, 33, null, 44, null],
            [9, 8, 7, 6, 5, 4, 3, 2, 1],
          ]),
          [
            {
              p: [0],
              rm: [2],
            },
          ],
        ).toArray(),
      ).toEqual([
        [9, 8, 7, 6, 5, 4, 3, 2, 1],
        [null, 11, null, 22, null, 33, null, 44, null],
        [1, 2, 3, 4, 5, 6, 7, 8, 9],
      ]);
    });
    it('MatrixOT should move col correctly', () => {
      expect(
        MatrixOT.apply<number | null, CSRMatrix<number | null>>(
          new CSRMatrix<number | null>().fromDense([
            [1, 2, 3, 4, 5, 6, 7, 8, 9],
            [null, 11, null, 22, null, 33, null, 44, null],
            [9, 8, 7, 6, 5, 4, 3, 2, 1],
          ]),
          [
            {
              p: [0],
              cm: [2],
            },
          ],
        ).toArray(),
      ).toEqual([
        [3, 2, 1, 4, 5, 6, 7, 8, 9],
        [null, 11, null, 22, null, 33, null, 44, null],
        [7, 8, 9, 6, 5, 4, 3, 2, 1],
      ]);
    });

    it('MatrixOT should throw invalid / missing instruction in op', () => {
      expect(() =>
        MatrixOT.apply<number | null, CSRMatrix<number | null>>(
          new CSRMatrix<number | null>().fromDense([
            [1, 2, 3, 4, 5, 6, 7, 8, 9],
            [null, 11, null, 22, null, 33, null, 44, null],
            [9, 8, 7, 6, 5, 4, 3, 2, 1],
          ]),
          [{ p: [0], om: [2] } as unknown as MatrixOTOperation<number | null>],
        ).toArray(),
      ).toThrow('invalid / missing instruction in op');
    });

    it('MatrixOT should bumps paths when list elements are inserted or removed', () => {
      expect(
        MatrixOT.transform(
          [{ p: [1, 200], uc: { value: 'hi', prev: null } }],
          [{ p: [0], ri: ['x'] }],
          OTTransformPriority.LEFT,
        ),
      ).toEqual([{ p: [2, 200], uc: { value: 'hi', prev: null } }]);
      expect(
        MatrixOT.transform(
          [{ p: [1, 200], uc: { value: 'hi', prev: null } }],
          [{ p: [0], ci: ['x'] }],
          OTTransformPriority.LEFT,
        ),
      ).toEqual([{ p: [1, 201], uc: { value: 'hi', prev: null } }]);
      expect(
        MatrixOT.transform(
          [{ p: [0, 201], uc: { value: 'hi', prev: null } }],
          [{ p: [0], ri: ['x'] }],
          OTTransformPriority.RIGHT,
        ),
      ).toEqual([{ p: [1, 201], uc: { value: 'hi', prev: null } }]);
      expect(
        MatrixOT.transform(
          [{ p: [1, 200], uc: { value: 'hi', prev: null } }],
          [{ p: [0], ci: ['x'] }],
          OTTransformPriority.RIGHT,
        ),
      ).toEqual([{ p: [1, 201], uc: { value: 'hi', prev: null } }]);

      expect(
        MatrixOT.transform(
          [{ p: [0, 202], uc: { value: 'hi', prev: null } }],
          [{ p: [203], ri: ['x'] }],
          OTTransformPriority.LEFT,
        ),
      ).toEqual([{ p: [0, 202], uc: { value: 'hi', prev: null } }]);
      expect(
        MatrixOT.transform(
          [{ p: [0, 202], uc: { value: 'hi', prev: null } }],
          [{ p: [203], ci: ['x'] }],
          OTTransformPriority.LEFT,
        ),
      ).toEqual([{ p: [0, 202], uc: { value: 'hi', prev: null } }]);

      expect(
        MatrixOT.transform(
          [{ p: [1, 203], uc: { value: 'hi', prev: null } }],
          [{ p: [0], rd: ['x'] }],
          OTTransformPriority.LEFT,
        ),
      ).toEqual([{ p: [0, 203], uc: { value: 'hi', prev: null } }]);
      expect(
        MatrixOT.transform(
          [{ p: [1, 203], uc: { value: 'hi', prev: null } }],
          [{ p: [0], cd: ['x'] }],
          OTTransformPriority.LEFT,
        ),
      ).toEqual([{ p: [1, 202], uc: { value: 'hi', prev: null } }]);

      expect(
        MatrixOT.transform(
          [{ p: [0, 204], uc: { value: 'hi', prev: null } }],
          [{ p: [1], rd: ['x'] }],
          OTTransformPriority.LEFT,
        ),
      ).toEqual([{ p: [0, 204], uc: { value: 'hi', prev: null } }]);
      expect(
        MatrixOT.transform(
          [{ p: [0, 204], uc: { value: 'hi', prev: null } }],
          [{ p: [205], cd: ['x'] }],
          OTTransformPriority.LEFT,
        ),
      ).toEqual([{ p: [0, 204], uc: { value: 'hi', prev: null } }]);

      expect(MatrixOT.transform([{ p: [0], rd: [] }], [{ p: [0], ri: [] }], OTTransformPriority.LEFT)).toEqual([
        { p: [1], rd: [] },
      ]);
      expect(MatrixOT.transform([{ p: [0], cd: [] }], [{ p: [0], ci: [] }], OTTransformPriority.LEFT)).toEqual([
        { p: [1], cd: [] },
      ]);

      expect(MatrixOT.transform([{ p: [0], rd: [] }], [{ p: [0], ri: [] }], OTTransformPriority.RIGHT)).toEqual([
        { p: [1], rd: [] },
      ]);
      expect(MatrixOT.transform([{ p: [0], cd: [] }], [{ p: [0], ci: [] }], OTTransformPriority.RIGHT)).toEqual([
        { p: [1], cd: [] },
      ]);
    });

    it('MatrixOT should converts ops on deleted elements to noops', () => {
      expect(
        MatrixOT.transform(
          [{ p: [1, 0], uc: { value: 'hi', prev: null } }],
          [{ p: [1], rd: ['x'] }],
          OTTransformPriority.LEFT,
        ),
      ).toEqual([]);
      expect(
        MatrixOT.transform(
          [{ p: [1, 0], uc: { value: 'hi', prev: null } }],
          [{ p: [0], cd: ['x'] }],
          OTTransformPriority.LEFT,
        ),
      ).toEqual([]);

      expect(MatrixOT.transform([{ p: [0], ri: ['a'] }], [{ p: [0], rd: ['b'] }], OTTransformPriority.LEFT)).toEqual([
        { p: [0], ri: ['a'] },
      ]);
      expect(MatrixOT.transform([{ p: [0], ci: ['a'] }], [{ p: [0], cd: ['b'] }], OTTransformPriority.LEFT)).toEqual([
        { p: [0], ci: ['a'] },
      ]);
    });

    it('keeps column-move path unchanged when another insert occurs to the right', () => {
      expect(MatrixOT.transform([{ p: [1], cm: [2] }], [{ p: [5], ci: ['x'] }], OTTransformPriority.LEFT)).toEqual([
        { p: [1], cm: [2] },
      ]);

      const destination: Array<MatrixOTOperation<number | null>> = [];
      MatrixOT.transformComponent(
        destination,
        { p: [1], cm: [2] } as unknown as MatrixOTOperation<number | null>,
        { p: [5], ci: [1] } as unknown as MatrixOTOperation<number | null>,
        OTTransformPriority.LEFT,
      );
      expect(destination).toEqual([{ p: [1], cm: [2] }]);
    });

    it('MatrixOT should changes deleted data to reflect edits', () => {
      // only support replace now
      expect(
        MatrixOT.transform(
          [{ p: [1], rd: [{ a: 1 }] }],
          [{ p: [1, 0], uc: { value: { b: 1, c: 1 }, prev: null } }],
          OTTransformPriority.LEFT,
        ),
      ).toEqual([{ p: [1], rd: [{ b: 1, c: 1 }] }]);
      expect(
        MatrixOT.transform(
          [{ p: [1], cd: [{ a: 1 }] }],
          [{ p: [1, 0], uc: { value: { b: 1, c: 1 }, prev: null } }],
          OTTransformPriority.LEFT,
        ),
      ).toEqual([{ p: [1], cd: [{ b: 1, c: 1 }] }]);
    });

    it('updates deleted row and column payloads through dense snapshots for nested structure edits', () => {
      expect(
        MatrixOT.transform(
          [
            {
              p: [1],
              rd: [{ value: 'A' }, { value: 'B' }],
            },
          ],
          [{ p: [1, 1], ci: [{ value: 'inserted' }] }],
          OTTransformPriority.LEFT,
        ),
      ).toEqual([
        {
          p: [1],
          rd: [{ value: 'inserted' }, { value: 'A' }, { value: 'B' }],
        },
      ]);

      expect(
        MatrixOT.transform(
          [
            {
              p: [1],
              cd: [{ value: 'A' }, { value: 'B' }],
            },
          ],
          [{ p: [1, 0], ri: [{ value: 'inserted' }] }],
          OTTransformPriority.LEFT,
        ),
      ).toEqual([
        {
          p: [1],
          cd: [{ value: 'inserted' }],
        },
      ]);

      expect(
        MatrixOT.transform([{ p: [1], rd: ['A', 'B'] }], [{ p: [1, 0], cd: ['A'] }], OTTransformPriority.LEFT),
      ).toEqual([{ p: [1], rd: ['B'] }]);
      expect(
        MatrixOT.transform([{ p: [1], rd: ['A', 'B'] }], [{ p: [1, 0], cm: [1] }], OTTransformPriority.LEFT),
      ).toEqual([{ p: [1], rd: ['B', 'A'] }]);
      expect(
        MatrixOT.transform(
          [{ p: [1], rd: ['A'] }],
          [{ p: [1, 0], uc: { value: null, prev: 'A' } }],
          OTTransformPriority.LEFT,
        ),
      ).toEqual([{ p: [1], rd: [null] }]);
      expect(MatrixOT.transform([{ p: [1], rd: ['A'] }], [{ p: [1, 0], rd: ['A'] }], OTTransformPriority.LEFT)).toEqual(
        [{ p: [1], rd: void 0 }],
      );
      expect(MatrixOT.transform([{ p: [1], rd: ['A'] }], [{ p: [1, 0], rm: [0] }], OTTransformPriority.LEFT)).toEqual([
        { p: [1], rd: ['A'] },
      ]);
    });

    it('MatrixOT should puts the left op first if two inserts are simultaneous', () => {
      expect(MatrixOT.transform([{ p: [1], ri: ['a'] }], [{ p: [1], ri: ['b'] }], OTTransformPriority.LEFT)).toEqual([
        { p: [1], ri: ['a'] },
      ]);
      expect(MatrixOT.transform([{ p: [1], ci: ['a'] }], [{ p: [1], ci: ['b'] }], OTTransformPriority.LEFT)).toEqual([
        { p: [1], ci: ['a'] },
      ]);

      expect(MatrixOT.transform([{ p: [1], ri: ['b'] }], [{ p: [1], ri: ['a'] }], OTTransformPriority.RIGHT)).toEqual([
        { p: [2], ri: ['b'] },
      ]);
      expect(MatrixOT.transform([{ p: [1], ci: ['b'] }], [{ p: [1], ci: ['a'] }], OTTransformPriority.RIGHT)).toEqual([
        { p: [2], ci: ['b'] },
      ]);
    });

    it('MatrixOT should converts an attempt to re-delete a list element into a no-op', () => {
      expect(MatrixOT.transform([{ p: [1], rd: ['x'] }], [{ p: [1], rd: ['x'] }], OTTransformPriority.LEFT)).toEqual(
        [],
      );
      expect(MatrixOT.transform([{ p: [1], cd: ['x'] }], [{ p: [1], cd: ['x'] }], OTTransformPriority.LEFT)).toEqual(
        [],
      );
      expect(MatrixOT.transform([{ p: [1], rd: ['x'] }], [{ p: [1], rd: ['x'] }], OTTransformPriority.RIGHT)).toEqual(
        [],
      );
      expect(MatrixOT.transform([{ p: [1], cd: ['x'] }], [{ p: [1], cd: ['x'] }], OTTransformPriority.RIGHT)).toEqual(
        [],
      );
    });
  });
});

describe('MatrixOT compose cases', () => {
  it('MatrixOT should composes insert then delete into a no-op', () => {
    expect(MatrixOT.compose([{ p: [1], ri: ['a', 'b', 'c'] }], [{ p: [1], rd: ['a', 'b', 'c'] }])).toEqual([]);
    expect(MatrixOT.compose([{ p: [1], ci: ['a', 'b', 'c'] }], [{ p: [1], cd: ['a', 'b', 'c'] }])).toEqual([]);

    expect(MatrixOT.transform([{ p: [0], ri: ['x'] }], [{ p: [0], ri: ['y'] }], OTTransformPriority.RIGHT)).toEqual([
      { p: [1], ri: ['x'] },
    ]);
    expect(MatrixOT.transform([{ p: [0], ci: ['x'] }], [{ p: [0], ci: ['y'] }], OTTransformPriority.RIGHT)).toEqual([
      { p: [1], ci: ['x'] },
    ]);
  });

  it("MatrixOT should doesn't change the original object", () => {
    const a = [{ p: [0], rd: ['abc'], anyKey: null }];
    MatrixOT.compose(a, [{ p: [0], rd: ['abc'] }]);
    expect(a).toEqual([{ p: [0], rd: ['abc'], anyKey: null }]);

    const b = [{ p: [0], cd: ['abc'], anyKey: null }];
    MatrixOT.compose(b, [{ p: [0], cd: ['abc'] }]);
    expect(b).toEqual([{ p: [0], cd: ['abc'], anyKey: null }]);
  });

  it('MatrixOT should composes together adjacent uc ops', () => {
    expect(
      MatrixOT.compose(
        [
          {
            p: [100, 100],
            uc: { value: { a: 1, b: 2 }, prev: { a: 9, b: 8 } },
          },
        ],
        [{ p: [100, 100], uc: { value: { b: 1 }, prev: { a: 7, b: 6 } } }],
      ),
    ).toEqual([{ p: [100, 100], uc: { value: { a: 1, b: 1 }, prev: { a: 9, b: 8 } } }]);
  });

  it('MatrixOT should moves ops on a moved element with the element', () => {
    // m & d
    expect(MatrixOT.transform([{ p: [4], rd: ['x'] }], [{ p: [4], rm: [10] }], OTTransformPriority.LEFT)).toEqual([
      { p: [10], rd: ['x'] },
    ]);
    expect(MatrixOT.transform([{ p: [4], cd: ['x'] }], [{ p: [4], cm: [10] }], OTTransformPriority.LEFT)).toEqual([
      { p: [10], cd: ['x'] },
    ]);

    expect(
      MatrixOT.transform(
        [{ p: [4, 1], uc: { value: 'a', prev: null } }],
        [{ p: [4], rm: [10] }],
        OTTransformPriority.LEFT,
      ),
    ).toEqual([{ p: [10, 1], uc: { value: 'a', prev: null } }]);
    expect(
      MatrixOT.transform(
        [{ p: [4, 1], uc: { value: 'a', prev: null } }],
        [{ p: [4], cm: [10] }],
        OTTransformPriority.LEFT,
      ),
    ).toEqual([{ p: [4, 1], uc: { value: 'a', prev: null } }]);

    expect(MatrixOT.transform([{ p: [5], rd: [6] }], [{ p: [5], rm: [1] }], OTTransformPriority.LEFT)).toEqual([
      { p: [1], rd: [6] },
    ]);
    expect(MatrixOT.transform([{ p: [5], cd: [6] }], [{ p: [5], cm: [1] }], OTTransformPriority.LEFT)).toEqual([
      { p: [1], cd: [6] },
    ]);

    expect(MatrixOT.transform([{ p: [2], ri: ['x'] }], [{ p: [0], rm: [1] }], OTTransformPriority.LEFT)).toEqual([
      { p: [2], ri: ['x'] },
    ]);
    expect(MatrixOT.transform([{ p: [2], ci: ['x'] }], [{ p: [0], cm: [1] }], OTTransformPriority.LEFT)).toEqual([
      { p: [2], ci: ['x'] },
    ]);

    // m & i
    expect(MatrixOT.transform([{ p: [4, 1], ri: ['a'] }], [{ p: [4], rm: [10] }], OTTransformPriority.LEFT)).toEqual([
      { p: [10, 1], ri: ['a'] },
    ]);
    expect(MatrixOT.transform([{ p: [4, 1], ci: ['a'] }], [{ p: [4], cm: [10] }], OTTransformPriority.LEFT)).toEqual([
      { p: [10, 1], ci: ['a'] },
    ]);

    expect(MatrixOT.transform([{ p: [5], ri: ['x'] }], [{ p: [5], rm: [1] }], OTTransformPriority.LEFT)).toEqual([
      { p: [5], ri: ['x'] },
    ]);
    expect(MatrixOT.transform([{ p: [5], ci: ['x'] }], [{ p: [5], cm: [1] }], OTTransformPriority.LEFT)).toEqual([
      { p: [5], ci: ['x'] },
    ]);
  });

  it('MatrixOT should moves target index on d / i', () => {
    expect(MatrixOT.transform([{ p: [0], rm: [2] }], [{ p: [1], rd: ['x'] }], OTTransformPriority.LEFT)).toEqual([
      { p: [0], rm: [1] },
    ]);
    expect(MatrixOT.transform([{ p: [0], cm: [2] }], [{ p: [1], cd: ['x'] }], OTTransformPriority.LEFT)).toEqual([
      { p: [0], cm: [1] },
    ]);

    expect(MatrixOT.transform([{ p: [2], rm: [4] }], [{ p: [1], rd: ['x'] }], OTTransformPriority.LEFT)).toEqual([
      { p: [1], rm: [3] },
    ]);
    expect(MatrixOT.transform([{ p: [2], cm: [4] }], [{ p: [1], cd: ['x'] }], OTTransformPriority.LEFT)).toEqual([
      { p: [1], cm: [3] },
    ]);

    expect(MatrixOT.transform([{ p: [0], rm: [2] }], [{ p: [1], ri: ['x'] }], OTTransformPriority.LEFT)).toEqual([
      { p: [0], rm: [3] },
    ]);
    expect(MatrixOT.transform([{ p: [0], cm: [2] }], [{ p: [1], ci: ['x'] }], OTTransformPriority.LEFT)).toEqual([
      { p: [0], cm: [3] },
    ]);

    expect(MatrixOT.transform([{ p: [2], rm: [4] }], [{ p: [1], ri: ['x'] }], OTTransformPriority.LEFT)).toEqual([
      { p: [3], rm: [5] },
    ]);
    expect(MatrixOT.transform([{ p: [2], cm: [4] }], [{ p: [1], ci: ['x'] }], OTTransformPriority.LEFT)).toEqual([
      { p: [3], cm: [5] },
    ]);

    expect(MatrixOT.transform([{ p: [0], rm: [0] }], [{ p: [0], ri: [28] }], OTTransformPriority.LEFT)).toEqual([
      { p: [1], rm: [1] },
    ]);
    expect(MatrixOT.transform([{ p: [0], cm: [0] }], [{ p: [0], ci: [28] }], OTTransformPriority.LEFT)).toEqual([
      { p: [1], cm: [1] },
    ]);
  });

  it('MatrixOT should tiebreaks m vs. d / i', () => {
    expect(MatrixOT.transform([{ p: [0], rm: [2] }], [{ p: [0], rd: ['x'] }], OTTransformPriority.LEFT)).toEqual([
      { p: [1], rm: [0] },
    ]);
    expect(MatrixOT.transform([{ p: [0], cm: [2] }], [{ p: [0], cd: ['x'] }], OTTransformPriority.LEFT)).toEqual([
      { p: [1], cm: [0] },
    ]);

    expect(MatrixOT.transform([{ p: [0], rm: [2] }], [{ p: [0], rd: ['x'] }], OTTransformPriority.RIGHT)).toEqual([
      { p: [1], rm: [0] },
    ]);
    expect(MatrixOT.transform([{ p: [0], cm: [2] }], [{ p: [0], cd: ['x'] }], OTTransformPriority.RIGHT)).toEqual([
      { p: [1], cm: [0] },
    ]);

    expect(MatrixOT.transform([{ p: [0], rm: [2] }], [{ p: [0], ri: ['x'] }], OTTransformPriority.LEFT)).toEqual([
      { p: [1], rm: [3] },
    ]);
    expect(MatrixOT.transform([{ p: [0], cm: [2] }], [{ p: [0], ci: ['x'] }], OTTransformPriority.LEFT)).toEqual([
      { p: [1], cm: [3] },
    ]);

    expect(MatrixOT.transform([{ p: [0], rm: [2] }], [{ p: [0], ri: ['x'] }], OTTransformPriority.RIGHT)).toEqual([
      { p: [1], rm: [3] },
    ]);
    expect(MatrixOT.transform([{ p: [0], cm: [2] }], [{ p: [0], ci: ['x'] }], OTTransformPriority.RIGHT)).toEqual([
      { p: [1], cm: [3] },
    ]);
  });

  it.each<[number, number, number, number, [number, number] | null]>([
    [0, 2, 2, 1, [0, 1]],
    [3, 3, 5, 0, [3, 3]],
    [2, 0, 1, 0, [2, 1]],
    [2, 0, 5, 0, [2, 5]],
    [2, 5, 2, 0, [0, 5]],
    [0, 1, 1, 0, null],
    [1, 3, 3, 1, null],
    [2, 6, 0, 1, [2, 6]],
    [0, 1, 2, 1, [0, 2]],
    [3, 2, 2, 1, [3, 1]],
  ])('rebases swaps (%s,%s) over (%s,%s) as permutations', (from, to, otherFrom, otherTo, expected) => {
    for (const make of [createMoveRowOTOperation, createMoveColOTOperation]) {
      const current = make([from], [to]);
      const other = make([otherFrom], [otherTo]);
      expect(MatrixOT.transform([current], [other], OTTransformPriority.LEFT)).toEqual(
        expected ? [make([expected[0]], [expected[1]])] : [],
      );
      expect(MatrixOT.transform([current], [other], OTTransformPriority.RIGHT)).toEqual(expected ? [current] : []);
    }
  });

  it('MatrixOT should changes indices correctly around a move', () => {
    expect(MatrixOT.transform([{ p: [2], rm: [1] }], [{ p: [1], rd: [3] }], OTTransformPriority.RIGHT)).toEqual([]);
    expect(MatrixOT.transform([{ p: [2], cm: [1] }], [{ p: [1], cd: [3] }], OTTransformPriority.RIGHT)).toEqual([]);
  });

  it('keeps insertion boundaries fixed while rebasing swap endpoints over insertions', () => {
    for (const [insert, swap] of [
      [createInsertRowOTOperation, createMoveRowOTOperation],
      [createInsertColOTOperation, createMoveColOTOperation],
    ] as const) {
      for (const [from, to] of [
        [1, 3],
        [3, 1],
        [1, 2],
        [2, 1],
      ]) {
        for (let index = 0; index <= 4; index++) {
          const insertion = insert([index], []);
          const movement = swap([from], [to]);
          expect(MatrixOT.transform([insertion], [movement], OTTransformPriority.LEFT)).toEqual([insertion]);
          expect(MatrixOT.transform([movement], [insertion], OTTransformPriority.RIGHT)).toEqual([
            swap([from + (index <= from ? 1 : 0)], [to + (index <= to ? 1 : 0)]),
          ]);
        }
      }
    }
  });

  it('MatrixOT should correctly handle interleaved insert and delete operations', () => {
    const matrix = new CSRMatrix<number>();
    matrix.fromDense([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    const operations = [
      { p: [1], ri: [7, 8, 9] },
      { p: [0], rd: [1, 2, 3] },
    ];
    MatrixOT.apply<number, CSRMatrix<number>>(matrix, operations);
    expect(matrix.toArray()).toEqual([
      [7, 8, 9],
      [4, 5, 6],
    ]);
  });

  it('MatrixOT should maintain correct state after a sequence of operations', () => {
    const matrix = new CSRMatrix<number>();
    matrix.fromDense([
      [1, 2],
      [3, 4],
    ]);
    const operations = [
      { p: [0], ci: [99, 99] },
      { p: [1, 2], uc: { value: 88, prev: 4 } },
      { p: [1], rd: [3, 88] },
    ];
    MatrixOT.apply<number, CSRMatrix<number>>(matrix, operations);
    expect(matrix.toArray()).toEqual([[99, 1, 2]]);
  });

  it('MatrixOT should correctly transform operations with multiple operations', () => {
    const operation = [
      { p: [1], ri: [1, 2, 3] },
      { p: [1, 1], uc: { value: 10, prev: 5 } },
    ];

    const otherOperation = [
      { p: [0], ri: [1, 2, 3] },
      { p: [1], ci: [4, 5] },
    ];

    const transformedOperations = MatrixOT.transform(operation, otherOperation, OTTransformPriority.LEFT);
    expect(transformedOperations).toEqual([
      { p: [2], ri: [1, 2, 3] },
      { p: [2, 2], uc: { value: 10, prev: 5 } },
    ]);

    const transformedOtherOperations = MatrixOT.transform(otherOperation, operation, OTTransformPriority.RIGHT);
    expect(transformedOtherOperations).toEqual([
      { p: [0], ri: [1, 2, 3] },
      { p: [1], ci: [4, 5] },
    ]);
  });

  it('MatrixOT should throw error with no path operation', () => {
    expect(() => MatrixOT.checkValidOp([{}] as unknown as MatrixOTOperation<unknown>[])).toThrow('Missing path');
  });

  it('MatrixOT should throw error with unknow OTTransformPriority', () => {
    expect(() => MatrixOT.transform([], [], 'unknow' as unknown as OTTransformPriority)).toThrow(
      `type must be '${OTTransformPriority.LEFT}' or '${OTTransformPriority.RIGHT}'`,
    );
  });

  it('MatrixOT should handle transformX correctly', () => {
    const leftOps = [
      {
        p: [0],
        ri: [1, 2, 3],
      },
      {
        p: [1],
        rm: [2],
      },
    ];
    const rightOps = [
      {
        p: [0],
        rd: [1, 2, 3],
      },
      {
        p: [1],
        ri: [4, 5, 6],
      },
    ];
    const newLeftOps = MatrixOT.transform(leftOps, rightOps, OTTransformPriority.RIGHT);
    expect(newLeftOps).toEqual([{ p: [0], ri: [1, 2, 3] }]);
  });

  it('MatrixOT other edge cases', () => {
    expect(MatrixOT.transform([{ p: [1], rm: [2] }], [], OTTransformPriority.RIGHT)).toEqual([{ p: [1], rm: [2] }]);
  });

  it('MatrixOT applies resize operations to dimension-style matrices', () => {
    const matrix = new CSRMatrix<number>(void 0, [1, 3]);
    matrix.addItem(0, 1, 40);

    const result = MatrixOT.apply(matrix, [
      { p: [0], rr: { value: 30, prev: 20 } } as any,
      { p: [1], rr: { value: null, prev: 40 } } as any,
      { p: [2], rc: { value: 50, prev: null } } as any,
      { p: [2], rc: { value: null, prev: 50 } } as any,
    ]);

    expect(result.toArray()).toEqual([[30, null, null]]);
  });

  it('MatrixOT creates inverse operations for every supported component', () => {
    expect(MatrixOT.invert([{ p: [1], ri: ['r'] }])).toEqual([{ p: [1], rd: ['r'] }]);
    expect(MatrixOT.invert([{ p: [1], rd: ['r'] }])).toEqual([{ p: [1], ri: ['r'] }]);
    expect(MatrixOT.invert([{ p: [1], rm: [3] }])).toEqual([{ p: [3], rm: [1] }]);
    expect(MatrixOT.invert([{ p: [2], ci: ['c'] }])).toEqual([{ p: [2], cd: ['c'] }]);
    expect(MatrixOT.invert([{ p: [2], cd: ['c'] }])).toEqual([{ p: [2], ci: ['c'] }]);
    expect(MatrixOT.invert([{ p: [2], cm: [4] }])).toEqual([{ p: [4], cm: [2] }]);
    expect(MatrixOT.invert([{ p: [0, 1], uc: { value: 'new', prev: 'old' } }])).toEqual([
      { p: [0, 1], uc: { value: 'old', prev: 'new' } },
    ]);
    expect(MatrixOT.invert([{ p: [0, 1], uc: { value: 'new', prev: void 0 } } as any])).toEqual([
      { p: [0, 1], uc: { value: void 0, prev: 'new' } },
    ]);
    expect(MatrixOT.invert([{ p: [2], rr: { value: 30, prev: null } }])).toEqual([
      { p: [2], rr: { value: null, prev: 30 } },
    ]);
    expect(MatrixOT.invert([{ p: [3], rc: { value: null, prev: 80 } }])).toEqual([
      { p: [3], rc: { value: 80, prev: null } },
    ]);
    expect(() => MatrixOT.invert([{ p: [0], om: [2] } as unknown as MatrixOTOperation<unknown>])).toThrow(
      'invalid / missing instruction in op',
    );
  });

  it('MatrixOT inverse restores matrix and dimension changes', () => {
    const matrix = new CSRMatrix<number | null>().fromDense([
      [1, 2],
      [3, 4],
    ]);
    const operations: MatrixOTOperation<number | null>[] = [
      { p: [0, 0], uc: { value: 9, prev: 1 } },
      { p: [1], ri: [5, null] },
      { p: [0], ci: [8, null, null] },
    ];
    const beforeArray = matrix.toArray();
    const beforeShape = [...matrix.shape];

    MatrixOT.apply(matrix, operations);
    MatrixOT.apply(matrix, MatrixOT.invert(operations));

    expect(matrix.toArray()).toEqual(beforeArray);
    expect(matrix.shape).toEqual(beforeShape);

    const deleteMatrix = new CSRMatrix<number | null>().fromDense([
      [1, 2],
      [3, 4],
    ]);
    const deleteOps: MatrixOTOperation<number | null>[] = [
      { p: [1], rd: [3, 4] },
      { p: [0], cd: [1] },
    ];
    MatrixOT.apply(deleteMatrix, deleteOps);
    MatrixOT.apply(deleteMatrix, MatrixOT.invert(deleteOps));
    expect(deleteMatrix.toArray()).toEqual([
      [1, 2],
      [3, 4],
    ]);

    const moveMatrix = new CSRMatrix<number | null>().fromDense([
      [1, 2],
      [3, 4],
    ]);
    const moveOps: MatrixOTOperation<number | null>[] = [
      { p: [0], rm: [1] },
      { p: [0], cm: [1] },
    ];
    MatrixOT.apply(moveMatrix, moveOps);
    MatrixOT.apply(moveMatrix, MatrixOT.invert(moveOps));
    expect(moveMatrix.toArray()).toEqual([
      [1, 2],
      [3, 4],
    ]);

    const dimensions = new CSRMatrix<number>(void 0, [1, 3]);
    const dimensionOps: MatrixOTOperation<number>[] = [
      { p: [0], rr: { value: 24, prev: null } },
      { p: [1], rc: { value: 80, prev: null } },
    ];
    MatrixOT.apply(dimensions, dimensionOps);
    MatrixOT.apply(dimensions, MatrixOT.invert(dimensionOps));
    expect(dimensions.toArray()).toEqual([[null, null, null]]);
  });

  it('MatrixOT transformComponent covers remaining guard and false-arm branches', () => {
    const callTransformComponent = (
      currentOperation: Record<string, unknown>,
      otherOperation: Record<string, unknown>,
      type: OTTransformPriority,
    ) => {
      return (MatrixOT as any).transformComponent([], currentOperation, otherOperation, type) as unknown[];
    };

    // Force common == null branch.
    const commonSpy = jest.spyOn(MatrixOT as any, 'commonLengthForOps');
    commonSpy.mockImplementationOnce(() => null).mockImplementation(() => 0);
    const nullCommonResult = callTransformComponent(
      { p: [1], ri: ['x'] },
      { p: [0], ri: ['y'] },
      OTTransformPriority.LEFT,
    );
    expect(nullCommonResult).toEqual([{ p: [1], ri: ['x'] }]);
    commonSpy.mockRestore();

    // RowInsert + RowMove with non-common operand length.
    callTransformComponent({ p: [5, 9], rm: [10] }, { p: [2], ri: ['r'] }, OTTransformPriority.LEFT);
    // RowDelete + RowMove with non-common operand length.
    callTransformComponent({ p: [5, 9], rm: [10] }, { p: [2], rd: ['r'] }, OTTransformPriority.LEFT);

    // RowMove vs RowMove where otherFrom === otherTo.
    callTransformComponent({ p: [3], rm: [5] }, { p: [2], rm: [2] }, OTTransformPriority.LEFT);
    // RowMove tie-break branch with type RIGHT (line 418 false arm).
    callTransformComponent({ p: [2], rm: [6] }, { p: [2], rm: [4] }, OTTransformPriority.RIGHT);
    // RowMove other branch where p !== from.
    callTransformComponent({ p: [9], rd: ['x'] }, { p: [2], rm: [4] }, OTTransformPriority.LEFT);

    // ColInsert + ColDelete with equality true but <= false via object coercion.
    const marker = {} as unknown as number;
    callTransformComponent({ p: [marker], cd: ['x'] }, { p: [marker], ci: ['y'] }, OTTransformPriority.LEFT);

    // ColInsert + ColMove with non-common operand length.
    callTransformComponent({ p: [5, 0], cm: [6] }, { p: [2], ci: ['c'] }, OTTransformPriority.LEFT);
    // ColDelete + ColMove with non-common operand length.
    callTransformComponent({ p: [5, 0], cm: [6] }, { p: [2], cd: ['c'] }, OTTransformPriority.LEFT);
    // ColDelete vs ColDelete same branch but different indices.
    callTransformComponent({ p: [5], cd: ['x'] }, { p: [2], cd: ['y'] }, OTTransformPriority.LEFT);

    // ColMove vs ColMove where otherFrom === otherTo.
    callTransformComponent({ p: [3], cm: [5] }, { p: [2], cm: [2] }, OTTransformPriority.LEFT);
    // ColMove tie-break branch with type RIGHT (line 586 false arm).
    callTransformComponent({ p: [2], cm: [6] }, { p: [2], cm: [4] }, OTTransformPriority.RIGHT);
    // ColMove other branch where p !== from.
    callTransformComponent({ p: [9], cd: ['x'] }, { p: [2], cm: [4] }, OTTransformPriority.LEFT);
  });
});
