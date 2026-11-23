import {
  CSRMatrix,
  DimensionsCSRMatrix,
  ColumnShapeDimensionsCSRMatrix,
  RowShapeDimensionsCSRMatrix,
} from '@searsuite/sear-domain-matrix';
import { SparseMatrix } from '../src/SparseMatrix';
import { MatrixActions } from '../src/MatrixActions';

describe('sear-matrix integration coverage', () => {
  it('should support a realistic spreadsheet editing workflow with sparse data and dimension hit-testing', () => {
    const sheet = new CSRMatrix<string | number | null>();
    sheet.fromDense([
      ['ID', 'Name', 'Score', null],
      [1, 'Alice', 92, null],
      [2, 'Bob', 88, null],
      [3, 'Cindy', 95, null],
    ]);

    const rowHeights = new RowShapeDimensionsCSRMatrix();
    rowHeights.fromDense([[28, 32, 32, 32]]);
    rowHeights.setDefaultValue(30);

    const colWidths = new ColumnShapeDimensionsCSRMatrix();
    colWidths.fromDense([[80, 140, 100, 120]]);

    // Product behavior: insert a "Status" column near the end.
    sheet.addColumn(3, ['Status', 'PASS', 'PASS', 'PASS']);
    colWidths.addColumn(3, [110]);

    // Product behavior: add a computed summary row.
    sheet.addRow(4, ['AVG', null, 91.67, null, null]);
    rowHeights.addColumn(4, [36]);

    // Product behavior: user drags rows and columns in UI.
    sheet.swapRow(1, 3);
    sheet.swapColumn(1, 3);

    // Product behavior: remove an obsolete helper column.
    sheet.deleteColumns(4);
    colWidths.deleteColumns(4);

    const current = sheet.toArray();

    expect(current).toEqual([
      ['ID', 'Status', 'Score', 'Name'],
      [3, 'PASS', 95, 'Cindy'],
      [2, 'PASS', 88, 'Bob'],
      [1, 'PASS', 92, 'Alice'],
      ['AVG', null, 91.67, null],
    ]);

    // Hit-testing check: where does x=320 land after all dimension edits?
    expect(colWidths.getRightBoundaryColIndexByDimension(320)).toBe(2);

    // Boundary checks for row heights are still stable after insertion.
    expect(rowHeights.getDimensionLeftBoundaryByIndex(4)).toBe(124);
    expect(rowHeights.getDimensionRightBoundaryByIndex(4)).toBe(160);
  });

  it('should cover CSR toArray guard branch when indices point outside dense bounds', () => {
    const brokenButTolerated = new CSRMatrix<number>(
      {
        data: [999],
        indices: [0, 1],
        indptr: [9],
      },
      [1, 1],
    );

    // The implementation intentionally guards assignment with !== void 0.
    expect(brokenButTolerated.toArray()).toEqual([[null]]);
  });

  it('should expose right-boundary API for DimensionsCSRMatrix in practical width mapping', () => {
    const widths = new DimensionsCSRMatrix();
    widths.fromDense([[120, 80, 60, 40]]);

    expect(widths.getDimensionLeftBoundaryByIndex(0)).toBe(0);
    expect(widths.getDimensionRightBoundaryByIndex(0)).toBe(120);
    expect(widths.getDimensionRightBoundaryByIndex(2)).toBe(260);
  });

  it('should execute MatrixActions factory and abstract SparseMatrix fallback errors', () => {
    class SparseMatrixProbe extends SparseMatrix<number> {
      public toArray(): number[][] {
        return [];
      }

      public callBaseGetItem() {
        return super.getItem(0, 0);
      }

      public callBaseGetRow() {
        return super.getRow(0);
      }

      public callBaseGetCol() {
        return super.getCol(0);
      }

      public callBaseDot(other: SparseMatrix<number>) {
        return super.dot(other);
      }

      public callBaseMultiply(other: SparseMatrix<number>) {
        return super.multiply(other);
      }

      public callBaseTranspose() {
        return super.transpose();
      }

      public callBaseSum() {
        return super.sum(null);
      }

      public callBaseNnz() {
        return super.nnz;
      }
    }

    const probe = new SparseMatrixProbe(2, 3);

    expect(probe.shape).toEqual([2, 3]);
    expect(probe.dispatch([])).toBe(probe);

    // These methods are intentionally abstract-like and should throw by default.
    expect(() => probe.callBaseGetItem()).toThrow('SparseMatrix.getItem must be implemented by subclasses.');
    expect(() => probe.callBaseGetRow()).toThrow('SparseMatrix.getRow must be implemented by subclasses.');
    expect(() => probe.callBaseGetCol()).toThrow('SparseMatrix.getCol must be implemented by subclasses.');
    expect(() => probe.callBaseDot(probe)).toThrow('SparseMatrix.dot must be implemented by subclasses.');
    expect(() => probe.callBaseMultiply(probe)).toThrow('SparseMatrix.multiply must be implemented by subclasses.');
    expect(() => probe.callBaseTranspose()).toThrow('SparseMatrix.transpose must be implemented by subclasses.');
    expect(() => probe.callBaseSum()).toThrow('SparseMatrix.sum must be implemented by subclasses.');
    expect(() => probe.callBaseNnz()).toThrow('SparseMatrix.nnz must be implemented by subclasses.');

    // Executes the factory body so MatrixActions.ts gets covered.
    expect(MatrixActions.addRowAction(3, 1)).toBeUndefined();
  });

  it('should invalidate dimensions cache when matrix mutates', () => {
    const dims = new DimensionsCSRMatrix();
    dims.fromDense([[50, 60, 70]]);

    const first = dims.getDimensionsMap();
    expect(first).toEqual([50, 110, 180]);

    dims.addItem(0, 1, 100);
    const second = dims.getDimensionsMap();

    expect(second).toEqual([50, 150, 220]);
    expect(second).not.toBe(first);
  });
});
