import {
  DimensionsCSRMatrix,
  ColumnShapeDimensionsCSRMatrix,
  RowShapeDimensionsCSRMatrix,
} from '@searsuite/sear-domain-matrix';

describe('', () => {
  const denseArray = [
    [0, 0, 0, 0, 0, 0, 0, 200, 0, 400, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 400, 200],
  ];
  const answer = [
    88, 176, 264, 352, 440, 528, 616, 816, 904, 1304, 1392, 1480, 1568, 1656, 1744, 1832, 1920, 2008, 2096, 2184, 2272,
    2360, 2448, 2536, 2624, 2712, 2800, 2888, 2976, 3064, 3152, 3240, 3640, 3840,
  ];
  const data = [200, 400, 400, 200];

  it('DimensionsCSRMatrix Should support two built-in forms.', () => {
    expect(new ColumnShapeDimensionsCSRMatrix().name).toEqual('COLUMN_SHAPE_STATE');
    expect(new RowShapeDimensionsCSRMatrix().name).toEqual('ROW_SHAPE_STATE');
  });

  it('DimensionsCSRMatrix should support dimensions correctly', () => {
    const indices = [0, 4];
    const indptr = [7, 9, 32, 33];
    const numRows = 1;
    const numCols = Math.max(...indptr) + 1;
    const defaultValue = 88;
    const matrix = new DimensionsCSRMatrix({ data, indices, indptr }, [numRows, numCols]);
    matrix.setDefaultValue(defaultValue);
    expect(matrix.getDimensionsMap()).toEqual(answer);
  });

  it('does not allow a caller to change cached dimensions through a read result', () => {
    const matrix = new DimensionsCSRMatrix(void 0, [1, 2]);
    matrix.setDefaultValue(24);
    const map = matrix.getDimensionsMap();

    expect(() => { map[0] = 999; }).toThrow();
    expect(matrix.getDimensionRightBoundaryByIndex(0)).toBe(24);
    expect((matrix as unknown as Record<string, unknown>)['_dimensionsMapCache']).toBeUndefined();
  });

  it('stores only non-default dimension overrides across direct and structural updates', () => {
    const matrix = new DimensionsCSRMatrix(void 0, [1, 2]);
    matrix.setDefaultValue(24);
    matrix.addItem(0, 0, 24);
    matrix.addItem(0, 1, 30);
    matrix.addRow(1, [24, 36]);
    matrix.addColumn(1, [24, 48]);

    expect(matrix.getItem(0, 0)).toBe(24);
    expect(matrix.getItem(0, 1)).toBe(24);
    expect(matrix.getItem(0, 2)).toBe(30);
    expect(matrix.getItem(1, 0)).toBe(24);
    expect(matrix.getItem(1, 1)).toBe(48);
    expect(matrix.getItem(1, 2)).toBe(36);

    matrix.setDefaultValue(30);
    expect(matrix.getItem(0, 2)).toBe(30);
  });

  it('DimensionsCSRMatrix should return left boundary dimension by col index correctly', () => {
    const defaultValue = 88;
    const matrix = new DimensionsCSRMatrix();
    matrix.fromDense(denseArray);
    matrix.setDefaultValue(defaultValue);
    const leftBoundary = matrix.getDimensionLeftBoundaryByIndex(~~(denseArray[0].length / 2));
    expect(leftBoundary).toEqual(answer[~~(denseArray[0].length / 2) - 1]);
  });

  it('DimensionsCSRMatrix should return left boundary col index by dimension correctly', () => {
    const defaultValue = 88;
    const matrix = new DimensionsCSRMatrix();
    matrix.fromDense(denseArray);
    matrix.setDefaultValue(defaultValue);

    // normal case
    const half = ~~(answer.length / 2);
    const leftBoundaryColIndex = matrix.getLeftBoundaryColIndexByDimension((answer[half] + answer[half + 1]) / 2);
    expect(leftBoundaryColIndex).toEqual(half);
    // normal case
    expect(matrix.getLeftBoundaryColIndexByDimension(answer[answer.length - 1] - 1)).toEqual(answer.length - 2);

    // edge case
    expect(matrix.getLeftBoundaryColIndexByDimension(0)).toEqual(0);
    expect(matrix.getLeftBoundaryColIndexByDimension(answer[answer.length - 1])).toEqual(answer.length - 1);
  });

  it('DimensionsCSRMatrix getRightBoundaryColIndexByDimension should return correct index', () => {
    const defaultValue = 88;
    const matrix = new DimensionsCSRMatrix();
    matrix.fromDense(denseArray);
    matrix.setDefaultValue(defaultValue);

    expect(matrix.getRightBoundaryColIndexByDimension(answer[answer.length - 1] - 1)).toEqual(answer.length - 1);

    expect(matrix.getRightBoundaryColIndexByDimension(1215)).toEqual(9);
    expect(matrix.getRightBoundaryColIndexByDimension(1216)).toEqual(9);
  });

  it('DimensionsCSRMatrix getLeftBoundaryColIndexByDimension should throw error for out of bounds', () => {
    const matrix = new DimensionsCSRMatrix();
    matrix.fromDense(denseArray);
    expect(() => matrix.getLeftBoundaryColIndexByDimension(-5)).toThrow('Index out of bounds');
    expect(() => matrix.getLeftBoundaryColIndexByDimension(5000)).toThrow('Index out of bounds');
  });

  it('DimensionsCSRMatrix getRightBoundaryColIndexByDimension should throw error for out of bounds', () => {
    const matrix = new DimensionsCSRMatrix();
    matrix.fromDense(denseArray);
    expect(() => matrix.getRightBoundaryColIndexByDimension(-5)).toThrow('Index out of bounds');
    expect(() => matrix.getRightBoundaryColIndexByDimension(5000)).toThrow('Index out of bounds');
  });
});
