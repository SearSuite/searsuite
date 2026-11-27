import { type SheetCommandClient } from '@searsuite/sear-assembly-commands';
import { type WorkbookSheetId } from '@searsuite/sear-domain-workbook';
/** Workbook access to independently owned Sheet command/query/subscription protocols. */
export interface WorkbookSheetClientsApi {
  getActiveId(): WorkbookSheetId;
  getActiveClient(): SheetCommandClient;
  getClient(sheetId: WorkbookSheetId): SheetCommandClient | null;
}
