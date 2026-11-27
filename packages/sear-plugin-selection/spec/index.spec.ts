import * as ownerApi0 from '@searsuite/sear-render';
import * as moduleExports from '../src/index';

describe('@searsuite/sear-plugin-selection public API', () => {
  it('exports selection, highlight, pipeline, rendering, and registry extension points', () => {
    expect(moduleExports.SheetSelectionPlugin).toBeDefined();
    expect(ownerApi0.SheetHighlightView).toBeDefined();
    expect(moduleExports.SheetSelectionInteractionName).toBeDefined();
    expect(moduleExports.SheetSelectionPipelineName).toBeDefined();
    expect(moduleExports.SheetSelectionPipelineStepName).toBeDefined();
    expect(moduleExports.SheetSelectionSource).toBeDefined();
    expect(moduleExports.registerSheetSelectionInteractionReducers).toBeDefined();
    expect(ownerApi0.SheetHighlightPipelineStepName).toBeDefined();
    expect(ownerApi0.SheetSelectionRenderSemantics).toBeDefined();
    expect(ownerApi0.SheetHighlightRegistry).toBeDefined();
  });
});
