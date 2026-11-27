import { type SheetEditor } from '@searsuite/sear-assembly-commands';
import { type WorkbookSheetId } from '@searsuite/sear-domain-workbook';

/** Read-only access to SheetEditor instances owned by one WorkbookEditor. */
export interface WorkbookSheetsApi {
  /** Returns the stable id of the active sheet. */
  getActiveId(): WorkbookSheetId;
  /** Returns the SheetEditor mounted for the active sheet. */
  getActiveEditor(): SheetEditor;
  /** Returns the mounted SheetEditor when sheetId is active; detached sheets return null. */
  getEditor(sheetId: WorkbookSheetId): SheetEditor | null;
}
