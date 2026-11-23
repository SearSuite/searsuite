import { RowShapeDimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import { resolveAxisInsertionBoundary } from '../src/resolveAxisInsertionBoundary';

describe('axis insertion boundaries', () => {
  it('uses half-cell edges with nonuniform dimensions and includes outer boundaries', () => {
    const sizes = new RowShapeDimensionsCSRMatrix(undefined, [1, 3]);
    sizes.setDefaultValue(24);
    sizes.addItem(0, 0, 40);
    for (const [coordinate, expected] of [
      [-1, 0],
      [0, 0],
      [19, 0],
      [20, 1],
      [39, 1],
      [40, 1],
      [51, 1],
      [52, 2],
      [64, 2],
      [76, 3],
      [88, 3],
      [999, 3],
    ]) {
      expect(resolveAxisInsertionBoundary(sizes, coordinate)).toBe(expected);
    }
  });
});
