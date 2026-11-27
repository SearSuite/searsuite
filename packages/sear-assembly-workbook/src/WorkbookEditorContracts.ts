import { type SheetEditor } from '@searsuite/sear-assembly-commands';
import { type SheetEditorAdapters, type SheetEditorConfiguration } from '@searsuite/sear-assembly-setup';
import { type WorkbookRuntimeConfiguration } from '@searsuite/sear-assembly-workbook-kernel';
import { type WorkbookSheetId } from '@searsuite/sear-domain-workbook';

/** Visual Sheet configuration supplied by Workbook browser and desktop hosts. */
export interface WorkbookSheetEditorFactoryInput {
  readonly sheetId: WorkbookSheetId;
  readonly configuration: SheetEditorConfiguration;
}
/** Creates the selected visual Sheet facade. */
export type WorkbookSheetEditorFactory = (input: WorkbookSheetEditorFactoryInput) => SheetEditor;
/** Visual Workbook composition layered on the neutral Workbook runtime. */
export interface WorkbookEditorConfiguration
  extends Omit<WorkbookRuntimeConfiguration, 'adapters' | 'sheetClientFactory'> {
  readonly adapters: SheetEditorAdapters;
  readonly viewport?: { readonly width: number; readonly height: number };
  readonly sheetViews?: SheetEditorConfiguration['viewExtensions'];
  readonly sheetEditorFactory?: WorkbookSheetEditorFactory;
}
