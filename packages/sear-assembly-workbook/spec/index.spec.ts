import * as ownerApi0 from '@searsuite/sear-assembly-workbook-kernel';
import * as moduleExports from '../src';

describe('sear-assembly-workbook exports', () => {
  it('exports workbook editor, command bus, and official commands', () => {
    expect(moduleExports.createWorkbookEditor).toBeDefined();
    expect(ownerApi0.WorkbookCommandBus).toBeDefined();
    expect(ownerApi0.AddWorkbookSheetCommand.id).toBe('workbook.addSheet');
    expect(ownerApi0.RemoveWorkbookSheetCommand.id).toBe('workbook.removeSheet');
    expect(ownerApi0.RenameWorkbookSheetCommand.id).toBe('workbook.renameSheet');
    expect(ownerApi0.ActivateWorkbookSheetCommand.id).toBe('workbook.activateSheet');
    expect(ownerApi0.MoveWorkbookSheetCommand.id).toBe('workbook.moveSheet');
    expect(ownerApi0.HideWorkbookSheetCommand.id).toBe('workbook.hideSheet');
    expect(ownerApi0.UnhideWorkbookSheetCommand.id).toBe('workbook.unhideSheet');
    expect(ownerApi0.WorkbookDocumentStateObservation.id).toBe('workbook.documentState');
    expect(ownerApi0.WorkbookActiveSheetEditorObservation.id).toBe('workbook.activeSheetEditor');
    expect(ownerApi0.WorkbookFormulaStateObservation.id).toBe('workbookFormula.state');
    expect(ownerApi0.WorkbookFormulaSheetTransactionObservation.id).toBe('workbookFormula.sheetTransaction');
    expect(ownerApi0.RecalculateWorkbookFormulasCommand.id).toBe('workbookFormula.recalculateDirty');
    expect(ownerApi0.WorkbookFormulaDependencyGraph).toBeDefined();
    expect(ownerApi0.WorkbookFormulaEvaluationRuntime).toBeDefined();
    expect(ownerApi0.WorkbookFormulaReferenceShifter).toBeDefined();
    expect(ownerApi0.WorkbookFormulaBrokenReferenceReason.SheetDeleted).toBe('sheetDeleted');
    expect(ownerApi0.WorkbookFormulaBrokenReferenceReason.ReferenceDeleted).toBe('referenceDeleted');
    expect(ownerApi0.WorkbookFormulaGraphReferenceKind.Broken).toBe('broken');
    expect(ownerApi0.isWorkbookFormulaBrokenReference).toBeDefined();
    expect(ownerApi0.WorkbookFormulaPlugin).toBeDefined();
    expect(ownerApi0.CaptureWorkbookSessionStateCommand.id).toBe('workbook.captureSessionState');
    expect(ownerApi0.ExportWorkbookStateCommand.id).toBe('workbook.exportState');
    expect(ownerApi0.UndoWorkbookCommand.id).toBe('workbook.undo');
    expect(ownerApi0.RedoWorkbookCommand.id).toBe('workbook.redo');
  });
});
