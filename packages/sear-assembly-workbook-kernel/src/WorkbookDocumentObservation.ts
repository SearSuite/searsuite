import { type SheetDocumentState } from '@searsuite/sear-assembly-sheet-state';
import { type WorkbookDocumentState } from '@searsuite/sear-domain-workbook';
import { defineStateObservation } from '@searsuite/sear-foundation-subscription';

/** Current workbook-owned metadata and per-sheet document payloads. */
export const WorkbookDocumentStateObservation =
  defineStateObservation<WorkbookDocumentState<SheetDocumentState>>('workbook.documentState');
