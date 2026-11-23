import {
  createDeleteColOTOperation,
  createDeleteRowOTOperation,
  createInsertColOTOperation,
  createInsertRowOTOperation,
  createMoveColOTOperation,
  createMoveRowOTOperation,
  createResizeColOTOperation,
  createResizeRowOTOperation,
  createUpdateCellOTOperation,
  createUpdateRectOTOperation,
} from '../src';

describe('semantic OT operation factories', () => {
  it('preserves the compact MatrixOT wire protocol', () => {
    expect(createInsertRowOTOperation([1], ['A'])).toEqual({ p: [1], ri: ['A'] });
    expect(createDeleteRowOTOperation([2], ['B'])).toEqual({ p: [2], rd: ['B'] });
    expect(createMoveRowOTOperation([3], [4])).toEqual({ p: [3], rm: [4] });
    expect(createInsertColOTOperation([5], ['C'])).toEqual({ p: [5], ci: ['C'] });
    expect(createDeleteColOTOperation([6], ['D'])).toEqual({ p: [6], cd: ['D'] });
    expect(createMoveColOTOperation([7], [8])).toEqual({ p: [7], cm: [8] });
    expect(createUpdateCellOTOperation([9, 10], 'next', 'previous')).toEqual({
      p: [9, 10],
      uc: { value: 'next', prev: 'previous' },
    });
    expect(createResizeRowOTOperation([11], 30, 24)).toEqual({ p: [11], rr: { value: 30, prev: 24 } });
    expect(createResizeColOTOperation([12], 120, 100)).toEqual({ p: [12], rc: { value: 120, prev: 100 } });
  });

  it('preserves the compact RectOT wire protocol', () => {
    expect(createUpdateRectOTOperation([0], [1, 2], [3, 4])).toEqual({
      p: [0],
      ur: [
        [1, 2],
        [3, 4],
      ],
    });
  });

  it('copies caller-owned paths and payload arrays', () => {
    const path = [1];
    const values = ['A'];
    const operation = createInsertRowOTOperation(path, values);

    path[0] = 9;
    values[0] = 'changed';

    expect(operation).toEqual({ p: [1], ri: ['A'] });
  });
});
