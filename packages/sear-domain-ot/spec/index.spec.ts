import * as moduleExports from '../src/index';

describe('@searsuite/sear-domain-ot public API', () => {
  it('exports all OT operation types and utility functions', () => {
    expect(moduleExports.BaseOT).toBeDefined();
    expect(moduleExports.OTTransformPriority).toBeDefined();
    expect(moduleExports.MatrixOT).toBeDefined();
    expect(moduleExports.MatrixOTActionName).toBeDefined();
    expect(moduleExports.RectOT).toBeDefined();
    expect(moduleExports.RectOTActionName).toBeDefined();
    expect(moduleExports.RichDocOT).toBeDefined();
    expect(moduleExports.RichDocOTActionName).toBeDefined();
    expect(moduleExports.getAllActionNames).toBeDefined();
  });

  it('getAllActionNames returns a non-empty Set of action name strings', () => {
    const names = moduleExports.getAllActionNames();
    expect(names).toBeInstanceOf(Set);
    expect(names.size).toBeGreaterThan(0);
  });
});
