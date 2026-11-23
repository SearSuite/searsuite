import { CSRMatrix } from '@searsuite/sear-domain-matrix';
import { assertCellHighlightRule, type CellHighlightRule } from './CellHighlightRule';

const rangeIndexCache = new WeakMap<CellHighlightMatrix, PositionedCellHighlightRule[]>();
const trackedRangeIndexes = new WeakSet<CellHighlightMatrix>();

export interface CellHighlightMatrixData {
  readonly data: (CellHighlightRule[] | null)[];
  readonly indices: number[];
  readonly indptr: number[];
}

export interface PositionedCellHighlightRule { readonly row: number; readonly column: number; readonly rule: CellHighlightRule }

/** Sparse rule anchors; the range index avoids scanning all rules for every visible cell. */
export class CellHighlightMatrix extends CSRMatrix<CellHighlightRule[] | null> {
  public constructor(data: CellHighlightMatrixData = { data: [], indices: [0], indptr: [] }, shape: [number, number] = [0, 0]) {
    super(void 0, shape);
    if (data.data.length === 0) return;
    for (let row = 0; row < shape[0]; row += 1) {
      for (let index = data.indices[row] ?? 0; index < (data.indices[row + 1] ?? 0); index += 1) {
        const column = data.indptr[index];
        const rules = data.data[index];
        if (column !== undefined && rules) this.setItem(row, column, rules);
      }
    }
  }

  public setItem(row: number, column: number, rules: CellHighlightRule[] | null): this {
    if (!rules?.length) { this.removeItem(row, column); return this; }
    rules.forEach((rule) => assertCellHighlightRule(rule, row, column, this.shape));
    return super.addItem(row, column, rules.map(cloneRule));
  }

  public override addItem(row: number, column: number, rules: CellHighlightRule[] | null): this {
    return this.setItem(row, column, rules);
  }

  public override getItem(row: number, column: number): CellHighlightRule[] | null {
    return super.getItem(row, column)?.map(cloneRule) ?? null;
  }

  /** Visits only stored anchors even when the sheet has many empty rows. */
  public override forEachStored(callback: (rules: CellHighlightRule[] | null, row: number, column: number) => void): void {
    if (this.shape[0] === 0 || this.shape[1] === 0) return;
    this.forEachStoredInRange(0, 0, this.shape[0] - 1, this.shape[1] - 1, callback);
  }

  public override clone(): this {
    const copy = new CellHighlightMatrix(void 0, [...this.shape] as [number, number]);
    this.forEachStored((rules, row, column) => copy.setItem(row, column, rules));
    return copy as this;
  }

  public getRules(): PositionedCellHighlightRule[] {
    const result: PositionedCellHighlightRule[] = [];
    this.forEachStored((rules, row, column) => rules?.forEach((rule) => result.push({ row, column, rule: cloneRule(rule) })));
    return result;
  }

  public findRules(row: number, column: number): PositionedCellHighlightRule[] {
    if (this.data.length === 0) return [];
    if (!trackedRangeIndexes.has(this)) {
      this.addListener(() => { rangeIndexCache.delete(this); });
      trackedRangeIndexes.add(this);
    }
    let index = rangeIndexCache.get(this);
    if (!index) {
      index = this.getRules().sort((a, b) => a.row - b.row);
      rangeIndexCache.set(this, index);
    }
    const result: PositionedCellHighlightRule[] = [];
    for (const entry of index) {
      if (entry.row > row) break;
      if (entry.column <= column && entry.rule.endRow >= row && entry.rule.endColumn >= column) {
        result.push({ row: entry.row, column: entry.column, rule: cloneRule(entry.rule) });
      }
    }
    return result;
  }

  public replaceRules(entries: readonly PositionedCellHighlightRule[]): void {
    this.assertMutable();
    this.data = [];
    this.indptr = [];
    this.indices = Array(this.numRows + 1).fill(0);
    const groups = new Map<string, { row: number; column: number; rules: CellHighlightRule[] }>();
    for (const entry of entries) {
      const key = `${entry.row}:${entry.column}`;
      const group = groups.get(key) ?? { row: entry.row, column: entry.column, rules: [] };
      group.rules.push(entry.rule);
      groups.set(key, group);
    }
    for (const group of groups.values()) this.setItem(group.row, group.column, group.rules);
    this.notifyListeners();
  }
}

function cloneRule(rule: CellHighlightRule): CellHighlightRule {
  return { ...rule, condition: { ...rule.condition } };
}
