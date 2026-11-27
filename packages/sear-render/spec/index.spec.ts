import * as API from '../src/index';

describe('sear-render index', () => {
  it('exports expected modules', () => {
    expect(API.SheetGridRender).toBeDefined();
    expect(API.SheetGridView).toBeDefined();
    expect(API.SheetRowNumberView).toBeDefined();
    expect(API.SheetColumnLabelView).toBeDefined();
    expect(API.SheetCornerView).toBeDefined();
    expect(API.SheetCellMergeRender).toBeDefined();
    expect(API.getSheetRangePositionRect).toBeDefined();
    expect(API.computeViewportRange).toBeDefined();
  });
});
