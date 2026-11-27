import { type SheetEditor } from '@searsuite/sear-assembly-commands';

import { type WorkbookSheetId } from '@searsuite/sear-domain-workbook';
import { defineStateObservation } from '@searsuite/sear-foundation-subscription';

/** Current live SheetEditor mounted by one WorkbookEditor instance. */
export interface WorkbookActiveSheetEditorSnapshot {
  /** Stable id of the sheet mounted by the live editor. */
  readonly sheetId: WorkbookSheetId;
  /** Live editor owned by the workbook assembly. */
  readonly editor: SheetEditor;
}

/** Current live active SheetEditor, updated only when the mounted editor changes. */
export const WorkbookActiveSheetEditorObservation =
  defineStateObservation<WorkbookActiveSheetEditorSnapshot>('workbook.activeSheetEditor');
