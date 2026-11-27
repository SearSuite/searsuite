import { type SearCoreSheet } from '@searsuite/sear-assembly-core';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { readSheetCellBorders } from '@searsuite/sear-plugin-cell-border';
import { ViewExtensionBase } from '@searsuite/sear-render-event-engine';
import { type CellProperties } from '@searsuite/sear-render-registry';
import { renderCellBorders } from './renderCellBorders';

/** Independent scene projection of the border owner's committed field. */
export class SheetCellBorderView extends ViewExtensionBase<SearCoreSheet, CellProperties> {
  public constructor() {
    super(new PluginKey('SheetCellBorderView'));
  }

  public render(context: SearCoreSheet) {
    const borders = readSheetCellBorders(context.dataEngine);
    return borders ? renderCellBorders(context, borders) : [];
  }
}
