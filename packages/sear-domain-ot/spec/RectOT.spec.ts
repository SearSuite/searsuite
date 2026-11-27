import { RectOT, type UpdateRectOTOperation } from '../src/RectOT';
import { Rect } from '@searsuite/sear-foundation-rect';

describe('RectOT sanity cases', () => {
  expect(new RectOT().name).toEqual('RectOT');
  it('MatrixOT create should return an empty operation list', () => {
    expect(RectOT.create()).toEqual([]);
    expect(RectOT.create([{ p: [0] }])).toEqual([{ p: [0] }]);
  });
});

describe('RectOT lists apply', () => {
  // it('MatrixOT should update cell correctly', () => {
  //     const matrix = new CSRMatrix<number>();
  //     matrix.fromDense([
  //         [1, 2, 3, 4, 5, 6, 7, 8, 9],
  //         [null, null, null, null, null, null, null, null, null],
  //         [9, 8, 7, 6, 5, 4, 3, 2, 1],
  //     ]);
  //     const updateCellOperation: UpdateCellOTOperation<(number | null)>[] = [
  //         {
  //             p: [1, 4],
  //             uc: {
  //                 value: 9999,
  //                 prev: null,
  //             },
  //         },
  //         {
  //             p: [0, 0],
  //             uc: {
  //                 value: null,
  //                 prev: 1,
  //             },
  //         }
  //     ];
  //     expect(MatrixOT.apply<number | null, CSRMatrix<number>>(matrix, updateCellOperation)).toEqual(new CSRMatrix().fromDense([
  //         [null, 2, 3, 4, 5, 6, 7, 8, 9],
  //         [null, null, null, null, 9999, null, null, null, null],
  //         [9, 8, 7, 6, 5, 4, 3, 2, 1],
  //     ]));
  // });

  it('RectOT should insert row correctly', () => {
    expect(
      RectOT.apply<number | null>(
        new Rect([
          [1, 1],
          [5, 5],
        ]),
        [
          {
            p: [0],
            ri: Array(9).fill(null),
          },
        ],
      ).shape,
    ).toEqual(
      new Rect([
        [2, 1],
        [6, 5],
      ]).shape,
    );

    expect(
      RectOT.apply<number | null>(
        new Rect([
          [1, 1],
          [5, 5],
        ]),
        [
          {
            p: [2],
            ri: Array(9).fill(null),
          },
        ],
      ).shape,
    ).toEqual(
      new Rect([
        [1, 1],
        [6, 5],
      ]).shape,
    );

    expect(
      RectOT.apply<number | null>(
        new Rect([
          [1, 1],
          [5, 5],
        ]),
        [
          {
            p: [6],
            ri: Array(9).fill(null),
          },
        ],
      ).shape,
    ).toEqual(
      new Rect([
        [1, 1],
        [5, 5],
      ]).shape,
    );
  });

  it('MatrixOT should insert col correctly', () => {
    expect(
      RectOT.apply<number | null>(
        new Rect([
          [1, 1],
          [5, 5],
        ]),
        [
          {
            p: [0],
            ci: [
              { type: 'text', value: 'x' },
              { type: 'text', value: 'y' },
            ],
          },
        ],
      ).shape,
    ).toEqual(
      new Rect([
        [1, 2],
        [5, 6],
      ]).shape,
    );

    expect(
      RectOT.apply<number | null>(
        new Rect([
          [1, 1],
          [5, 5],
        ]),
        [
          {
            p: [3],
            ci: [
              { type: 'text', value: 'x' },
              { type: 'text', value: 'y' },
            ],
          },
        ],
      ).shape,
    ).toEqual(
      new Rect([
        [1, 1],
        [5, 6],
      ]).shape,
    );

    expect(
      RectOT.apply<number | null>(
        new Rect([
          [1, 1],
          [5, 5],
        ]),
        [
          {
            p: [6],
            ci: [
              { type: 'text', value: 'x' },
              { type: 'text', value: 'y' },
            ],
          },
        ],
      ).shape,
    ).toEqual(
      new Rect([
        [1, 1],
        [5, 5],
      ]).shape,
    );
  });

  it('RectOT should consume row and column move operations with the matrix swap semantics', () => {
    expect(RectOT.invert([{ p: [1], rm: [4] }], new Rect())).toEqual([{ p: [4], rm: [1] }]);
    expect(RectOT.invert([{ p: [0], cm: [3] }], new Rect())).toEqual([{ p: [3], cm: [0] }]);
    expect(
      RectOT.apply(
        new Rect([
          [1, 1],
          [3, 3],
        ]),
        [
          { p: [1], rm: [4] },
          { p: [0], cm: [3] },
        ],
      ).shape,
    ).toEqual([
      [3, 0],
      [4, 1],
    ]);
  });

  it('MatrixOT should delete row correctly', () => {
    expect(
      RectOT.apply<number | null>(
        new Rect([
          [1, 1],
          [5, 5],
        ]),
        [
          {
            p: [0],
            rd: [],
          },
        ],
      ).shape,
    ).toEqual(
      new Rect([
        [0, 1],
        [4, 5],
      ]).shape,
    );

    expect(
      RectOT.apply<number | null>(
        new Rect([
          [1, 1],
          [5, 5],
        ]),
        [
          {
            p: [1],
            rd: [],
          },
        ],
      ).shape,
    ).toEqual(
      new Rect([
        [1, 1],
        [4, 5],
      ]).shape,
    );

    expect(
      RectOT.apply<number | null>(
        new Rect([
          [1, 1],
          [5, 5],
        ]),
        [
          {
            p: [6],
            rd: [],
          },
        ],
      ).shape,
    ).toEqual(
      new Rect([
        [1, 1],
        [5, 5],
      ]).shape,
    );
  });
  it('MatrixOT should delete col correctly', () => {
    expect(
      RectOT.apply<number | null>(
        new Rect([
          [1, 1],
          [5, 5],
        ]),
        [
          {
            p: [0],
            cd: [
              { type: 'text', value: 'x' },
              { type: 'text', value: 'y' },
            ],
          },
        ],
      ).shape,
    ).toEqual(
      new Rect([
        [1, 0],
        [5, 4],
      ]).shape,
    );

    expect(
      RectOT.apply<number | null>(
        new Rect([
          [1, 1],
          [5, 5],
        ]),
        [
          {
            p: [1],
            cd: [],
          },
        ],
      ).shape,
    ).toEqual(
      new Rect([
        [1, 1],
        [5, 4],
      ]).shape,
    );
  });

  it('RectOT should update rect correctly', () => {
    const rect = new Rect([
      [1, 1],
      [5, 5],
    ]);
    const result = RectOT.apply<number | null>(rect, [
      {
        p: [0],
        ur: [
          [2, 2],
          [6, 6],
        ],
      },
    ]);

    expect(result).toBe(rect);
  });

  it('RectOT creates inverse operations from the previous rect state', () => {
    const rect = new Rect([
      [1, 1],
      [5, 5],
    ]);
    const operations: UpdateRectOTOperation[] = [
      {
        p: [0],
        ur: [
          [2, 2],
          [6, 6],
        ],
      },
      {
        p: [0],
        ur: [
          [3, 3],
          [7, 7],
        ],
      },
    ];

    const inverse = RectOT.invert(operations, rect);

    expect(inverse).toEqual([
      {
        p: [0],
        ur: [
          [2, 2],
          [6, 6],
        ],
      },
      {
        p: [0],
        ur: [
          [1, 1],
          [5, 5],
        ],
      },
    ]);
    RectOT.apply(rect, operations);
    RectOT.apply(rect, inverse);
    expect(rect.shape).toEqual([
      [1, 1],
      [5, 5],
    ]);
  });

  it('RectOT creates inverse operations for structural row and column changes', () => {
    expect(RectOT.invert([{ p: [1], ri: [] }], new Rect())).toEqual([{ p: [1], rd: [] }]);
    expect(RectOT.invert([{ p: [1], rd: [] }], new Rect())).toEqual([{ p: [1], ri: [] }]);
    expect(RectOT.invert([{ p: [2], ci: [] }], new Rect())).toEqual([{ p: [2], cd: [] }]);
    expect(RectOT.invert([{ p: [2], cd: [] }], new Rect())).toEqual([{ p: [2], ci: [] }]);
  });

  it('RectOT throws when update inverse lacks previous rect state', () => {
    expect(() =>
      RectOT.invertComponent({
        p: [0],
        ur: [
          [1, 1],
          [2, 2],
        ],
      }),
    ).toThrow('RectOT update rect inverse requires previous rect state');
    expect(() => RectOT.invert([{ p: [0], om: [2] } as unknown as UpdateRectOTOperation], new Rect())).toThrow(
      'invalid / missing instruction in op',
    );
  });

  it('MatrixOT should throw invalid / missing instruction in op', () => {
    expect(
      () =>
        RectOT.apply<number | null>(
          new Rect([
            [1, 1],
            [5, 5],
          ]),
          [{ p: [0], om: [2] } as unknown as UpdateRectOTOperation],
        ).shape,
    ).toThrow('invalid / missing instruction in op');
  });

  // it('MatrixOT should bumps paths when list elements are inserted or removed', () => {
  //     expect(MatrixOT.transform([{ p: [1, 200], uc: { value: 'hi', prev: null } }], [{ p: [0], ri: ['x'] }], OTTransformPriority.LEFT)).toEqual([{ p: [2, 200], uc: { value: 'hi', prev: null } }]);
  //     expect(MatrixOT.transform([{ p: [1, 200], uc: { value: 'hi', prev: null } }], [{ p: [0], ci: ['x'] }], OTTransformPriority.LEFT)).toEqual([{ p: [1, 201], uc: { value: 'hi', prev: null } }]);
  //     expect(MatrixOT.transform([{ p: [0, 201], uc: { value: 'hi', prev: null } }], [{ p: [0], ri: ['x'] }], OTTransformPriority.RIGHT)).toEqual([{ p: [1, 201], uc: { value: 'hi', prev: null } }]);
  //     expect(MatrixOT.transform([{ p: [1, 200], uc: { value: 'hi', prev: null } }], [{ p: [0], ci: ['x'] }], OTTransformPriority.RIGHT)).toEqual([{ p: [1, 201], uc: { value: 'hi', prev: null } }]);

  //     expect(MatrixOT.transform([{ p: [0, 202], uc: { value: 'hi', prev: null } }], [{ p: [203], ri: ['x'] }], OTTransformPriority.LEFT)).toEqual([{ p: [0, 202], uc: { value: 'hi', prev: null } }]);
  //     expect(MatrixOT.transform([{ p: [0, 202], uc: { value: 'hi', prev: null } }], [{ p: [203], ci: ['x'] }], OTTransformPriority.LEFT)).toEqual([{ p: [0, 202], uc: { value: 'hi', prev: null } }]);

  //     expect(MatrixOT.transform([{ p: [1, 203], uc: { value: 'hi', prev: null } }], [{ p: [0], rd: ['x'] }], OTTransformPriority.LEFT)).toEqual([{ p: [0, 203], uc: { value: 'hi', prev: null } }]);
  //     expect(MatrixOT.transform([{ p: [1, 203], uc: { value: 'hi', prev: null } }], [{ p: [0], cd: ['x'] }], OTTransformPriority.LEFT)).toEqual([{ p: [1, 202], uc: { value: 'hi', prev: null } }]);

  //     expect(MatrixOT.transform([{ p: [0, 204], uc: { value: 'hi', prev: null } }], [{ p: [1], rd: ['x'] }], OTTransformPriority.LEFT)).toEqual([{ p: [0, 204], uc: { value: 'hi', prev: null } }]);
  //     expect(MatrixOT.transform([{ p: [0, 204], uc: { value: 'hi', prev: null } }], [{ p: [205], cd: ['x'] }], OTTransformPriority.LEFT)).toEqual([{ p: [0, 204], uc: { value: 'hi', prev: null } }]);

  //     expect(MatrixOT.transform([{ p: [0], rd: [] }], [{ p: [0], ri: [] }], OTTransformPriority.LEFT)).toEqual([{ p: [1], rd: [] }]);
  //     expect(MatrixOT.transform([{ p: [0], cd: [] }], [{ p: [0], ci: [] }], OTTransformPriority.LEFT)).toEqual([{ p: [1], cd: [] }]);

  //     expect(MatrixOT.transform([{ p: [0], rd: [] }], [{ p: [0], ri: [] }], OTTransformPriority.RIGHT)).toEqual([{ p: [1], rd: [] }]);
  //     expect(MatrixOT.transform([{ p: [0], cd: [] }], [{ p: [0], ci: [] }], OTTransformPriority.RIGHT)).toEqual([{ p: [1], cd: [] }]);
  // })

  // it('MatrixOT should converts ops on deleted elements to noops', () => {
  //     expect(MatrixOT.transform([{ p: [1, 0], uc: { value: 'hi', prev: null } }], [{ p: [1], rd: ['x'] }], OTTransformPriority.LEFT)).toEqual([]);
  //     expect(MatrixOT.transform([{ p: [1, 0], uc: { value: 'hi', prev: null } }], [{ p: [0], cd: ['x'] }], OTTransformPriority.LEFT)).toEqual([]);

  //     expect(MatrixOT.transform([{ p: [0], ri: ['a'] }], [{ p: [0], rd: ['b'] }], OTTransformPriority.LEFT)).toEqual([{ p: [0], ri: ['a'] }]);
  //     expect(MatrixOT.transform([{ p: [0], ci: ['a'] }], [{ p: [0], cd: ['b'] }], OTTransformPriority.LEFT)).toEqual([{ p: [0], ci: ['a'] }]);
  // })

  // it('MatrixOT should changes deleted data to reflect edits', () => {
  //     // only support replace now
  //     expect(MatrixOT.transform([{ p: [1], rd: [{ a: 1 }] }], [{ p: [1, 0], uc: { value: { b: 1, c: 1 }, prev: null }}], OTTransformPriority.LEFT)).toEqual([{ p: [1], rd: [{ b: 1, c: 1 }] }]);
  //     expect(MatrixOT.transform([{ p: [1], cd: [{ a: 1 }] }], [{ p: [1, 0], uc: { value: { b: 1, c: 1 }, prev: null }}], OTTransformPriority.LEFT)).toEqual([{ p: [1], cd: [{ b: 1, c: 1 }] }]);
  // })

  // it('MatrixOT should puts the left op first if two inserts are simultaneous', () => {
  //     expect(MatrixOT.transform([{ p: [1], ri: ['a'] }], [{ p: [1], ri: ['b'] }], OTTransformPriority.LEFT)).toEqual([{ p: [1], ri: ['a'] }]);
  //     expect(MatrixOT.transform([{ p: [1], ci: ['a'] }], [{ p: [1], ci: ['b'] }], OTTransformPriority.LEFT)).toEqual([{ p: [1], ci: ['a'] }]);

  //     expect(MatrixOT.transform([{ p: [1], ri: ['b'] }], [{ p: [1], ri: ['a'] }], OTTransformPriority.RIGHT)).toEqual([{ p: [2], ri: ['b'] }]);
  //     expect(MatrixOT.transform([{ p: [1], ci: ['b'] }], [{ p: [1], ci: ['a'] }], OTTransformPriority.RIGHT)).toEqual([{ p: [2], ci: ['b'] }]);
  // })

  // it('MatrixOT should converts an attempt to re-delete a list element into a no-op', () => {
  //     expect(MatrixOT.transform([{ p: [1], rd: ['x'] }], [{ p: [1], rd: ['x'] }], OTTransformPriority.LEFT)).toEqual([]);
  //     expect(MatrixOT.transform([{ p: [1], cd: ['x'] }], [{ p: [1], cd: ['x'] }], OTTransformPriority.LEFT)).toEqual([]);
  //     expect(MatrixOT.transform([{ p: [1], rd: ['x'] }], [{ p: [1], rd: ['x'] }], OTTransformPriority.RIGHT)).toEqual([]);
  //     expect(MatrixOT.transform([{ p: [1], cd: ['x'] }], [{ p: [1], cd: ['x'] }], OTTransformPriority.RIGHT)).toEqual([]);
  // })
});
