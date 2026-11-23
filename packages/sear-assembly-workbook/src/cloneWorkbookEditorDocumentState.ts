import { cloneSheetDocumentState, type SheetDocumentState } from '@searsuite/sear-assembly-setup';
import { type WorkbookDocumentState } from '@searsuite/sear-domain-workbook';
import { cloneJsonRecord, cloneJsonValue } from '@searsuite/sear-plugin-export';

/** Detaches the Workbook document and every Sheet payload from caller-owned state. */
export function cloneWorkbookEditorDocumentState(
  document: WorkbookDocumentState<SheetDocumentState>,
): WorkbookDocumentState<SheetDocumentState> {
  return {
    id: document.id,
    sheets: cloneJsonValue(document.sheets, 'workbook.sheets'),
    sheetStates: Object.fromEntries(
      Object.entries(document.sheetStates).map(([id, state]) => [id, cloneSheetDocumentState(state)]),
    ),
    ...(document.metadata === undefined
      ? {}
      : { metadata: cloneJsonRecord(document.metadata, 'workbook.metadata')! }),
  };
}
