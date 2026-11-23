import { CSRMatrix } from '../src';

describe('CSR row deletion after permutation', () => {
  it.each([
    [0, 1],
    [1, 2],
    [3, 1],
    [0, 4],
  ])('rebases every surviving offset after deleting %s,%s', (start, count) => {
    const matrix = new CSRMatrix<string>(undefined, [4, 3]);
    matrix.addItem(0, 0, 'a');
    matrix.addItem(1, 0, 'b');
    matrix.addItem(1, 2, 'c');
    matrix.addItem(3, 1, 'd');
    matrix.swapRow(0, 3);
    const expected = matrix.toArray();
    expected.splice(start, count);
    matrix.deleteRows(start, count);
    expect(matrix.toArray()).toEqual(expected);
    expect(matrix.shape).toEqual([4 - count, 3]);
  });
});
