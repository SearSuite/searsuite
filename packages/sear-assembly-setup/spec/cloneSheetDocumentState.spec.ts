import { CSRMatrix } from '@searsuite/sear-domain-matrix';
import { cloneSheetDocumentState } from '../src/sheet/cloneSheetDocumentState';
import { type SheetDocumentState } from '../src/sheet/SheetEditorContracts';

function cloneExtra(value: unknown): unknown {
  return cloneSheetDocumentState({ extra: value } as unknown as SheetDocumentState);
}

it('does not trust a matrix clone hook that returns the caller-owned handle', () => {
  class SharedMatrix extends CSRMatrix<number> {
    public override clone(): this { return this; }
  }
  const matrix = new SharedMatrix({ data: [], indices: [0], indptr: [] }, [1, 1]);

  const copy = (cloneExtra(matrix) as { extra: SharedMatrix }).extra;
  copy.addItem(0, 0, 7);

  expect(copy).not.toBe(matrix);
  expect(copy.getItem(0, 0)).toBe(7);
  expect(matrix.getItem(0, 0)).toBeNull();
});

it('does not trust a matrix clone hook that shares sparse storage with the input', () => {
  class SharedStorageMatrix extends CSRMatrix<number> {
    public override clone(): this {
      const copy = super.clone();
      copy.data = this.data;
      return copy;
    }
  }
  const matrix = new SharedStorageMatrix(void 0, [1, 1]);
  matrix.addItem(0, 0, 4);

  const copy = (cloneExtra(matrix) as { extra: SharedStorageMatrix }).extra;
  copy.addItem(0, 0, 9);

  expect(copy.getItem(0, 0)).toBe(9);
  expect(matrix.getItem(0, 0)).toBe(4);
});

it('rejects custom clones with shared visible data', () => {
  class ShallowValue {
    public constructor(public nested: { count: number }) {}
    public clone(): ShallowValue { return new ShallowValue(this.nested); }
  }
  const value = new ShallowValue({ count: 1 });

  expect(() => cloneExtra(value)).toThrow('retained mutable input references');
  expect(value.nested.count).toBe(1);
});
