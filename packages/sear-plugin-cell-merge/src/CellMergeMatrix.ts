import { SearError } from '@searsuite/sear-foundation-error';
import { CSRMatrix } from '@searsuite/sear-domain-matrix';
import { Rect } from '@searsuite/sear-foundation-rect';
import { CellMergeRangeIndex } from './CellMergeRangeIndex';
import { type CellMergeBounds } from './CellMergeBounds';

const rangeIndexCache = new WeakMap<CellMergeMatrix, CellMergeRangeIndex>();
const trackedRangeIndexes = new WeakSet<CellMergeMatrix>();

/** Sparse value stored only at the top-left cell of a merged range. */
export interface SheetCellMerge {
  readonly endRow: number;
  readonly endColumn: number;
}

/** Serialized CSR entries accepted by CellMergeMatrix. */
export interface CellMergeMatrixData {
  readonly data: (SheetCellMerge | null)[];
  readonly indices: number[];
  readonly indptr: number[];
}

/** Sparse matrix containing one end coordinate at every merged-range anchor. */
export class CellMergeMatrix extends CSRMatrix<SheetCellMerge | null> {
  public constructor(
    data: CellMergeMatrixData = { data: [], indices: [0], indptr: [] },
    shape: [number, number] = [0, 0],
  ) {
    super(void 0, shape);
    for (let row = 0; row < shape[0]; row += 1) {
      const start = data.indices[row] ?? 0;
      const end = data.indices[row + 1] ?? start;
      for (let index = start; index < end; index += 1) {
        const value = data.data[index];
        const column = data.indptr[index];
        if (column !== void 0 && value !== null) this.setItem(row, column, value);
      }
    }
  }

  /** Stores or clears a merged range anchored at the supplied cell. */
  public setItem(row: number, column: number, value: SheetCellMerge | null): this {
    if (value === null) {
      this.removeItem(row, column);
      return this;
    }
    assertMergeValue(row, column, value, this.shape);
    return super.addItem(row, column, cloneMerge(value));
  }

  public override addItem(row: number, column: number, value: SheetCellMerge | null): this {
    return this.setItem(row, column, value);
  }

  /** Returns an isolated value so callers cannot mutate persisted matrix state. */
  public override getItem(row: number, column: number): SheetCellMerge | null {
    const value = super.getItem(row, column);
    return value === null ? null : cloneMerge(value);
  }

  /** Visits actual anchors only, locating their rows through CSR pointer binary search. */
  public override forEachStored(callback: (value: SheetCellMerge | null, row: number, col: number) => void): void {
    for (let index = 0; index < this.data.length; index += 1) {
      let low = 0;
      let high = this.numRows;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (this.indices[middle + 1] <= index) low = middle + 1;
        else high = middle;
      }
      callback(this.data[index], low, this.indptr[index]);
    }
  }

  /** Deep-clones stored merge values. */
  public override clone(): this {
    const clone = new CellMergeMatrix(void 0, [...this.shape] as [number, number]);
    this.forEachStored((value, row, column) => clone.setItem(row, column, value));
    return clone as this;
  }

  /** Returns all merged ranges in matrix traversal order. */
  public getRanges(): Rect[] {
    const ranges: Rect[] = [];
    this.forEachStored((value, row, column) => {
      if (value === null) return;
      ranges.push(
        new Rect([
          [row, column],
          [value.endRow, value.endColumn],
        ]),
      );
    });
    return ranges;
  }

  /** Finds the merged range containing one sheet cell. */
  public findRange(row: number, column: number): Rect | null {
    if (this.data.length === 0) return null;
    if (!trackedRangeIndexes.has(this)) {
      this.addListener(() => { rangeIndexCache.delete(this); });
      trackedRangeIndexes.add(this);
    }
    let index = rangeIndexCache.get(this);
    if (!index) {
      const ranges: CellMergeBounds[] = [];
      this.forEachStored((value, startRow, startColumn) => {
        if (value) ranges.push({ startRow, startColumn, ...value });
      });
      index = new CellMergeRangeIndex(ranges);
      rangeIndexCache.set(this, index);
    }
    const range = index.find(row, column);
    return range
      ? new Rect([
          [range.startRow, range.startColumn],
          [range.endRow, range.endColumn],
        ])
      : null;
  }

  /** Rebuilds sparse entries from normalized ranges while preserving matrix shape. */
  public replaceRanges(ranges: readonly Rect[]): this {
    this.assertMutable();
    rangeIndexCache.delete(this);
    this.data = [];
    this.indptr = [];
    this.indices = Array(this.numRows + 1).fill(0);
    ranges.forEach((range) => {
      const [startRow, startColumn] = range.getPoint(0);
      const [endRow, endColumn] = range.getPoint(1);
      if (startRow !== endRow || startColumn !== endColumn) {
        this.setItem(startRow, startColumn, { endRow, endColumn });
      }
    });
    this.notifyListeners();
    return this;
  }
}

function assertMergeValue(row: number, column: number, value: SheetCellMerge, shape: readonly number[]): void {
  if (!Number.isInteger(value.endRow) || !Number.isInteger(value.endColumn)) {
    throw new SearError('Sheet cell merge end coordinate must contain integers.');
  }
  if (value.endRow < row || value.endColumn < column || (value.endRow === row && value.endColumn === column)) {
    throw new SearError('Sheet cell merge must cover at least two cells and end after its anchor.');
  }
  if (value.endRow >= (shape[0] ?? 0) || value.endColumn >= (shape[1] ?? 0)) {
    throw new SearError('Sheet cell merge is outside current sheet bounds.');
  }
}

function cloneMerge(value: SheetCellMerge): SheetCellMerge {
  return { endRow: value.endRow, endColumn: value.endColumn };
}
