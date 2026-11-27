import * as ownerApi0 from '@searsuite/sear-render';
import * as moduleExports from '../src/index';

describe('@searsuite/sear-plugin-cell-editor public API', () => {
  it('exports all cell editor types and entry points', () => {
    expect(moduleExports.SheetCellEditorPlugin).toBeDefined();
    expect(moduleExports.getCellEditableValue).toBeDefined();
    expect(ownerApi0.Highlighter).toBeDefined();
    expect(ownerApi0.FormulaReferenceHighlighter).toBeDefined();
    expect(moduleExports.SheetCellEditorExitReason).toBeDefined();
    expect(moduleExports.SheetCellEditorInteractionName).toBeDefined();
    expect(moduleExports.SheetCellEditorKind).toBeDefined();
    expect(moduleExports.SheetCellEditorPipelineName).toBeDefined();
    expect(moduleExports.SheetCellEditorPipelineStepName).toBeDefined();
    expect(moduleExports.registerSheetCellEditorInteractionReducers).toBeDefined();
  });
});
