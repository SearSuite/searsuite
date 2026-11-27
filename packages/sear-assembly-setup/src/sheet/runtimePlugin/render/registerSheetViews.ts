import { ViewExtensionRegistry } from '@searsuite/sear-render-event-engine';
import { type SearCoreSheet } from '@searsuite/sear-assembly-core';

import { type Container, Scope } from '@searsuite/sear-foundation-di';
import { SheetColumnLabelView, SheetCornerView, SheetGridView, SheetGridRender, SheetRowNumberView } from '@searsuite/sear-render';
import { SheetCellMergeRender } from '@searsuite/sear-render';
import { type CellProperties } from '@searsuite/sear-render-registry';

/** Registers render-owned plugins in the order expected by the sheet scene. */
export function registerSheetViews(container: Container): void {
  const views = container.resolve<ViewExtensionRegistry<SearCoreSheet, CellProperties>>(ViewExtensionRegistry.symbol);
  container.register(SheetCellMergeRender.symbol, SheetCellMergeRender, Scope.Singleton);
  const mergeRender = container.resolve<SheetCellMergeRender>(SheetCellMergeRender.symbol);
  views.register(mergeRender);
  container.register(SheetCornerView.symbol, SheetCornerView, Scope.Singleton);
  container.register(SheetColumnLabelView.symbol, SheetColumnLabelView, Scope.Singleton);
  container.register(SheetRowNumberView.symbol, SheetRowNumberView, Scope.Singleton);
  container.register(SheetGridRender.symbol, SheetGridRender, Scope.Singleton);
  container.register(SheetGridView.symbol, SheetGridView, Scope.Singleton);
  views.register(container.resolve<SheetGridView>(SheetGridView.symbol));
}
