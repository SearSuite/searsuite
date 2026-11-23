import * as moduleExports from '../src';

describe('sear-assembly-workbook exports', () => {
  it('exports workbook editor, command bus, and official commands', () => {
    expect(moduleExports.createWorkbookEditor).toBeDefined();
    expect(moduleExports.WorkbookCommandBus).toBeDefined();
    expect(moduleExports.AddWorkbookSheetCommand.id).toBe('workbook.addSheet');
    expect(moduleExports.RemoveWorkbookSheetCommand.id).toBe('workbook.removeSheet');
    expect(moduleExports.RenameWorkbookSheetCommand.id).toBe('workbook.renameSheet');
    expect(moduleExports.ActivateWorkbookSheetCommand.id).toBe('workbook.activateSheet');
    expect(moduleExports.MoveWorkbookSheetCommand.id).toBe('workbook.moveSheet');
    expect(moduleExports.HideWorkbookSheetCommand.id).toBe('workbook.hideSheet');
    expect(moduleExports.UnhideWorkbookSheetCommand.id).toBe('workbook.unhideSheet');
    expect(moduleExports.WorkbookDocumentStateObservation.id).toBe('workbook.documentState');
    expect(moduleExports.WorkbookActiveSheetEditorObservation.id).toBe('workbook.activeSheetEditor');
    expect(moduleExports.WorkbookFormulaStateObservation.id).toBe('workbookFormula.state');
    expect(moduleExports.WorkbookFormulaSheetTransactionObservation.id).toBe('workbookFormula.sheetTransaction');
    expect(moduleExports.RecalculateWorkbookFormulasCommand.id).toBe('workbookFormula.recalculateDirty');
    expect(moduleExports.WorkbookFormulaDependencyGraph).toBeDefined();
    expect(moduleExports.WorkbookFormulaEvaluationRuntime).toBeDefined();
    expect(moduleExports.WorkbookFormulaReferenceShifter).toBeDefined();
    expect(moduleExports.WorkbookFormulaBrokenReferenceReason.SheetDeleted).toBe('sheetDeleted');
    expect(moduleExports.WorkbookFormulaBrokenReferenceReason.ReferenceDeleted).toBe('referenceDeleted');
    expect(moduleExports.WorkbookFormulaGraphReferenceKind.Broken).toBe('broken');
    expect(moduleExports.isWorkbookFormulaBrokenReference).toBeDefined();
    expect(moduleExports.WorkbookFormulaPlugin).toBeDefined();
    expect(moduleExports.CaptureWorkbookSessionStateCommand.id).toBe('workbook.captureSessionState');
    expect(moduleExports.ExportWorkbookStateCommand.id).toBe('workbook.exportState');
    expect(moduleExports.UndoWorkbookCommand.id).toBe('workbook.undo');
    expect(moduleExports.RedoWorkbookCommand.id).toBe('workbook.redo');
  });
});
