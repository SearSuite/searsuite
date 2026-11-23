import { CSRMatrix } from '@searsuite/sear-domain-matrix';
import { assertDataValidationRule, type DataValidationRule } from './DataValidationRule';

const rangeIndexCache = new WeakMap<DataValidationMatrix, PositionedDataValidationRule[]>();
const trackedRangeIndexes = new WeakSet<DataValidationMatrix>();

/** A rule with its persisted range anchor. */
export interface PositionedDataValidationRule {
  readonly row: number;
  readonly column: number;
  readonly rule: DataValidationRule;
}

/** Sparse range anchors for validation rules. */
export class DataValidationMatrix extends CSRMatrix<DataValidationRule[] | null> {
  public constructor(
    data: { readonly data: (DataValidationRule[] | null)[]; readonly indices: number[]; readonly indptr: number[] } =
      { data: [], indices: [0], indptr: [] },
    shape: [number, number] = [0, 0],
  ) {
    super(void 0, shape);
    for (let row = 0; row < Math.min(shape[0], data.indices.length - 1); row += 1) {
      for (let index = data.indices[row] ?? 0; index < (data.indices[row + 1] ?? 0); index += 1) {
        const column = data.indptr[index];
        const rules = data.data[index];
        if (column !== undefined && rules) this.setItem(row, column, rules);
      }
    }
  }

  public setItem(row: number, column: number, rules: DataValidationRule[] | null): this {
    if (!rules?.length) { this.removeItem(row, column); return this; }
    rules.forEach((rule) => assertDataValidationRule(rule, row, column, this.shape));
    return super.addItem(row, column, rules.map(cloneRule));
  }

  public override addItem(row: number, column: number, rules: DataValidationRule[] | null): this {
    return this.setItem(row, column, rules);
  }

  public override getItem(row: number, column: number): DataValidationRule[] | null {
    return super.getItem(row, column)?.map(cloneRule) ?? null;
  }

  public override clone(): this {
    const copy = new DataValidationMatrix(void 0, [...this.shape] as [number, number]);
    this.forEachStored((rules, row, column) => copy.setItem(row, column, rules));
    return copy as this;
  }

  public getRules(): PositionedDataValidationRule[] {
    const rules: PositionedDataValidationRule[] = [];
    if (!this.numRows || !this.numCols) return rules;
    this.forEachStoredInRange(0, 0, this.numRows - 1, this.numCols - 1, (entries, row, column) =>
      entries?.forEach((rule) => rules.push({ row, column, rule: cloneRule(rule) })));
    return rules;
  }

  public findRules(row: number, column: number): PositionedDataValidationRule[] {
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
    const found: PositionedDataValidationRule[] = [];
    for (const entry of index) {
      if (entry.row > row) break;
      if (entry.column <= column && entry.rule.endRow >= row && entry.rule.endColumn >= column) {
        found.push({ row: entry.row, column: entry.column, rule: cloneRule(entry.rule) });
      }
    }
    return found;
  }

  public replaceRules(entries: readonly PositionedDataValidationRule[]): void {
    this.assertMutable();
    this.data = [];
    this.indptr = [];
    this.indices = Array(this.numRows + 1).fill(0);
    for (const entry of entries) {
      const previous = this.getItem(entry.row, entry.column);
      this.setItem(entry.row, entry.column, [...(previous ?? []), entry.rule]);
    }
    this.notifyListeners();
  }
}

function cloneRule(rule: DataValidationRule): DataValidationRule {
  return {
    ...rule,
    condition: {
      ...rule.condition,
      ...(rule.condition.options ? { options: rule.condition.options.map((option) => ({ ...option })) } : {}),
      ...(rule.condition.sourceRange ? { sourceRange: {
        start: [...rule.condition.sourceRange.start] as [number, number],
        end: [...rule.condition.sourceRange.end] as [number, number],
      } } : {}),
    },
  };
}
