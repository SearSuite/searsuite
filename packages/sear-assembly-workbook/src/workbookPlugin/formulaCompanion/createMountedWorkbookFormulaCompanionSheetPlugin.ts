import { Injectable } from '@searsuite/sear-foundation-di';
import type { SheetPlugin, SheetPluginImplementation } from '@searsuite/sear-assembly-setup';
import type { WorkbookSheetId } from '@searsuite/sear-domain-workbook';
import type { WorkbookFormulaPlugin } from '../formula/WorkbookFormulaPlugin';
import type { ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { WorkbookFormulaCompanionSheetPlugin } from './WorkbookFormulaCompanionSheetPlugin';

export function createMountedWorkbookFormulaCompanionSheetPlugin(
  workbookFormula: WorkbookFormulaPlugin,
  sheetId: WorkbookSheetId,
  workbookObservations: ObservationRegistry,
): SheetPluginImplementation<SheetPlugin<unknown>> {
  class MountedWorkbookFormulaCompanionSheetPlugin extends WorkbookFormulaCompanionSheetPlugin {
    public static readonly symbol = Symbol(`WorkbookFormulaCompanionSheetPlugin:${sheetId}`);

    public constructor() {
      super(workbookFormula, sheetId, workbookObservations);
    }
  }
  Injectable()(MountedWorkbookFormulaCompanionSheetPlugin);
  return MountedWorkbookFormulaCompanionSheetPlugin as SheetPluginImplementation<SheetPlugin<unknown>>;
}
