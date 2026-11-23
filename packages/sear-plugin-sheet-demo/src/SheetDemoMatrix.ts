import { CSRMatrix } from '@searsuite/sear-domain-matrix';
import { assertSheetDemoMarker, type SheetDemoMarker } from './SheetDemoMarker';

export interface SheetDemoMatrixData {
  readonly data: (SheetDemoMarker | null)[];
  readonly indices: number[];
  readonly indptr: number[];
}

/** One marker per cell; absence and null both mean no marker. */
export class SheetDemoMatrix extends CSRMatrix<SheetDemoMarker | null> {
  public constructor(
    data: SheetDemoMatrixData = { data: [], indices: [0], indptr: [] },
    shape: [number, number] = [0, 0],
  ) {
    super(void 0, shape);
    for (let row = 0; row < shape[0]; row += 1) {
      const start = data.indices[row] ?? 0;
      const end = data.indices[row + 1] ?? start;
      for (let index = start; index < end; index += 1) {
        const column = data.indptr[index];
        const marker = data.data[index];
        if (column !== undefined && marker != null) this.setItem(row, column, marker);
      }
    }
  }

  public setItem(row: number, column: number, marker: SheetDemoMarker | null): this {
    if (marker === null) {
      this.removeItem(row, column);
      return this;
    }
    assertSheetDemoMarker(marker);
    return super.addItem(row, column, marker);
  }

  public override addItem(row: number, column: number, marker: SheetDemoMarker | null): this {
    return this.setItem(row, column, marker);
  }
}
