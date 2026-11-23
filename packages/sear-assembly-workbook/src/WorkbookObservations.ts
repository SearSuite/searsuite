import { type SheetEditor, type SheetDocumentState } from '@searsuite/sear-assembly-setup';
import { type WorkbookDocumentState, type WorkbookSheetId } from '@searsuite/sear-domain-workbook';
import { defineStateObservation } from '@searsuite/sear-foundation-subscription';

/** Current live SheetEditor mounted by one WorkbookEditor instance. */
export interface WorkbookActiveSheetEditorSnapshot {
  /** Stable id of the sheet mounted by the live editor. */
  readonly sheetId: WorkbookSheetId;
  /** Live editor owned by the workbook assembly. */
  readonly editor: SheetEditor;
}

/** Current workbook-owned metadata and per-sheet document payloads. */
export const WorkbookDocumentStateObservation =
  defineStateObservation<WorkbookDocumentState<SheetDocumentState>>('workbook.documentState');

/** Current live active SheetEditor, updated only when the mounted editor changes. */
export const WorkbookActiveSheetEditorObservation =
  defineStateObservation<WorkbookActiveSheetEditorSnapshot>('workbook.activeSheetEditor');
