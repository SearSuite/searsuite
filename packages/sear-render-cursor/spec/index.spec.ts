import * as ownerApi0 from '@searsuite/sear-render';
import * as moduleExports from '../src/index';

describe('@searsuite/sear-render-cursor public API', () => {
  it('exports all cursor engine types and registry', () => {
    expect(moduleExports.CursorToken).toBeDefined();
    expect(moduleExports.CursorEngine).toBeDefined();
    expect(moduleExports.HeadlessCursorEngine).toBeDefined();
    expect(moduleExports.CursorRuleKind).toBeDefined();
    expect(moduleExports.CursorRulePriority).toBeDefined();
    expect(moduleExports.CursorRegistry).toBeDefined();
    expect(ownerApi0.SheetCursorView).toBeDefined();
  });
});
