import { CSRMatrix } from '@searsuite/sear-domain-matrix';
import { type SheetFilterDefinition } from './SheetFilterTypes';

/** One sparse anchor holds the current range and its column rules. */
export class SheetFilterMatrix extends CSRMatrix<SheetFilterDefinition | null> {
  public constructor(data?: { data: (SheetFilterDefinition | null)[]; indices: number[]; indptr: number[] }) {
    super(data, [1, 1]);
  }

  public override getItem(row: number, column: number): SheetFilterDefinition | null {
    const definition = super.getItem(row, column);
    return definition ? cloneSheetFilterDefinition(definition) : null;
  }

  public override addItem(row: number, column: number, value: SheetFilterDefinition | null): this {
    if (value === null) { this.removeItem(row, column); return this; }
    return super.addItem(row, column, cloneSheetFilterDefinition(value));
  }

  public override clone(): this {
    const copy = new SheetFilterMatrix();
    const definition = this.getItem(0, 0);
    if (definition) copy.addItem(0, 0, definition);
    return copy as this;
  }
}

export function cloneSheetFilterDefinition(definition: SheetFilterDefinition): SheetFilterDefinition {
  return {
    range: { start: [...definition.range.start] as [number, number], end: [...definition.range.end] as [number, number] },
    rules: definition.rules.map(({ column, predicate }) => ({
      column, predicate: { ...predicate, ...(predicate.kind === 'values' ? { values: [...predicate.values] } : {}) },
    })),
    firstRowIsHeader: definition.firstRowIsHeader,
    privateView: definition.privateView,
  };
}
