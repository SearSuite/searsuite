import { createMoveRowsOperations, createMoveColumnsOperations, SheetAxisMoveBoundsError } from '../src';

describe('sheet axis reorder operations', () => {
  it('preserves block and neighbor order for every insertion in a small axis', () => {
    const size = 8;
    for (let index = 0; index < size; index++) {
      for (let count = 1; count <= size - index; count++) {
        for (let before = 0; before <= size; before++) {
          const input = { index, count, before };
          const original = Array.from({ length: size }, (_, i) => i);
          const expected = [...original];
          if (before < index || before > index + count) {
            const block = expected.splice(index, count);
            expected.splice(before > index ? before - count : before, 0, ...block);
          }
          const rowOperations = createMoveRowsOperations(input, size);
          expect(rowOperations.length).toBeLessThan(size);
          for (const [from, to] of rowOperations.map((operation) => [operation.p[0], operation.rm[0]])) {
            [original[from], original[to]] = [original[to], original[from]];
          }
          expect(original).toEqual(expected);
          expect(createMoveColumnsOperations(input, size)).toEqual(rowOperations.map(({ p, rm }) => ({ p, cm: rm })));
        }
      }
    }
  });

  it.each([
    { index: -1, before: 0 },
    { index: 0.5, before: 2 },
    { index: 0, count: 0, before: 2 },
    { index: 7, count: 2, before: 0 },
    { index: 0, before: 9 },
    { index: 0, before: -1 },
  ])('rejects invalid bounds %j', (input) => {
    expect(() => createMoveRowsOperations(input, 8)).toThrow(SheetAxisMoveBoundsError);
  });
});
