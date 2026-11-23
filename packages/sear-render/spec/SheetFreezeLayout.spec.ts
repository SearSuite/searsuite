import { RowShapeDimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import { FixedRowMatrix } from '@searsuite/sear-plugin-fixed-row';
import { activeFixedRowOffsets, visibleFrozenIndices } from '../src/sheet/SheetFreezeLayout';

describe('Sheet freeze layout', () => {
  it('keeps the frozen prefix viewport bounded', () => {
    const sizes = new RowShapeDimensionsCSRMatrix(void 0, [1, 100_000]);
    sizes.setDefaultValue(20);
    expect(visibleFrozenIndices(50_000, sizes, 60)).toEqual([0, 1, 2]);
  });

  it('activates fixed rows only after they reach the frozen stack', () => {
    const sizes = new RowShapeDimensionsCSRMatrix(void 0, [1, 20]);
    sizes.setDefaultValue(20);
    const fixed = new FixedRowMatrix(void 0, [1, 20]);
    fixed.addItem(0, 7, true);
    expect(activeFixedRowOffsets(fixed, sizes, 0, 3, 24).size).toBe(0);
    expect(activeFixedRowOffsets(fixed, sizes, 80, 3, 24).get(7)).toBe(84);
  });

  it('skips hidden or already frozen fixed rows', () => {
    const sizes = new RowShapeDimensionsCSRMatrix(void 0, [1, 20]);
    sizes.setDefaultValue(20);
    sizes.addItem(0, 4, 0);
    const fixed = new FixedRowMatrix(void 0, [1, 20]);
    fixed.addItem(0, 1, true);
    fixed.addItem(0, 4, true);
    fixed.addItem(0, 7, true);
    expect(activeFixedRowOffsets(fixed, sizes, 200, 3, 24)).toEqual(new Map([[7, 84]]));
    expect(activeFixedRowOffsets(null, sizes, 200, 3, 24)).toEqual(new Map());
  });
});
