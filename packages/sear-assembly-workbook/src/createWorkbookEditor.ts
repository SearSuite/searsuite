import { createSheetEditor } from '@searsuite/sear-assembly-setup';
import { createWorkbookRuntime, type WorkbookEditor } from '@searsuite/sear-assembly-workbook-kernel';
import { type WorkbookEditorConfiguration } from './WorkbookEditorContracts';

/** Attaches visual Sheet sessions to the shared Workbook business runtime. */
export function createWorkbookEditor(configuration: WorkbookEditorConfiguration): WorkbookEditor {
  const { viewport, sheetViews, sheetEditorFactory, adapters, ...business } = configuration;
  return createWorkbookRuntime({
    ...business,
    adapters,
    sheetClientFactory: (input) => {
      const sheet = {
        ...input.configuration,
        adapters: { ...adapters, ...input.configuration.adapters },
        ...(viewport ? { viewport } : {}),
        ...(sheetViews ? { viewExtensions: sheetViews } : {}),
      };
      return sheetEditorFactory ? sheetEditorFactory({ ...input, configuration: sheet }) : createSheetEditor(sheet);
    },
  });
}
