import { type SheetDocumentState } from '@searsuite/sear-assembly-setup';
import { type WorkbookDocumentState } from '@searsuite/sear-domain-workbook';

/** Read-only access to the document-owned state of one WorkbookEditor. */
export interface WorkbookDocumentApi {
  /** Returns the current in-memory workbook document state. */
  getState(): WorkbookDocumentState<SheetDocumentState>;
}
