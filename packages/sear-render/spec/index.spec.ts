import * as API from '../src/index';

describe('sear-render index', () => {
  it('exports expected modules', () => {
    expect(API.SheetGridRender).toBeDefined();
    expect(API.SheetGridPlugin).toBeDefined();
    expect(API.SheetRowNumberPlugin).toBeDefined();
    expect(API.SheetColumnLabelPlugin).toBeDefined();
    expect(API.SheetCornerPlugin).toBeDefined();
    expect(API.SheetCellMergeRender).toBeDefined();
    expect(API.getSheetRangePositionRect).toBeDefined();
    expect(API.computeViewportRange).toBeDefined();
  });
});
