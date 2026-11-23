import * as moduleExports from '../src/index';

describe('@searsuite/sear-plugin-selection public API', () => {
  it('exports selection, highlight, pipeline, rendering, and registry extension points', () => {
    expect(moduleExports.SheetSelectionPlugin).toBeDefined();
    expect(moduleExports.SheetHighlightPlugin).toBeDefined();
    expect(moduleExports.SheetSelectionInteractionName).toBeDefined();
    expect(moduleExports.SheetSelectionPipelineName).toBeDefined();
    expect(moduleExports.SheetSelectionPipelineStepName).toBeDefined();
    expect(moduleExports.SheetSelectionSource).toBeDefined();
    expect(moduleExports.registerSheetSelectionInteractionReducers).toBeDefined();
    expect(moduleExports.SheetHighlightPipelineStepName).toBeDefined();
    expect(moduleExports.SheetSelectionRenderSemantics).toBeDefined();
    expect(moduleExports.SheetHighlightRegistry).toBeDefined();
  });
});
