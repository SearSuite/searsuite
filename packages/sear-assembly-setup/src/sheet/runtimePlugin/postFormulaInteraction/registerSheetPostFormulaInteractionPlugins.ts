import { type SearCoreSheet } from '@searsuite/sear-assembly-core';
import { type PluginManager } from '@searsuite/sear-assembly-plugin';
import { type Container, Scope } from '@searsuite/sear-foundation-di';
import { CellType } from '@searsuite/sear-domain-cell-types';
import { IFormulaResultProvider } from '@searsuite/sear-domain-formula-engine';
import { FormulaCrossSheetHighlightSource, SheetFormulaReferenceHighlightPlugin } from '@searsuite/sear-plugin-formula';
import { SheetHeaderHighlightPlugin } from '@searsuite/sear-plugin-header-highlight';
import { SheetResizePlugin, type SheetResizeDimensions } from '@searsuite/sear-plugin-resize';
import { SheetHighlightPlugin, SheetSelectionPlugin } from '@searsuite/sear-plugin-selection';
import { SheetZoomPlugin } from '@searsuite/sear-plugin-zoom';
import { SheetCursorPlugin } from '@searsuite/sear-render-cursor';
import { type CellProperties } from '@searsuite/sear-render-registry';

/** Registers interaction plugins that must start after formula services are available. */
export function registerSheetPostFormulaInteractionPlugins(
  container: Container,
  manager: PluginManager<SearCoreSheet, CellProperties>,
  dimensions: SheetResizeDimensions,
): void {
  container.register(SheetCursorPlugin.symbol, SheetCursorPlugin, Scope.Singleton);
  manager.registerPlugin(container.resolve<SheetCursorPlugin>(SheetCursorPlugin.symbol));
  container.register(SheetResizePlugin.symbol, SheetResizePlugin, Scope.Singleton);
  const resizePlugin = container.resolve<SheetResizePlugin>(SheetResizePlugin.symbol);
  resizePlugin.setResizeDimensions(dimensions);
  const formulaResults = container.resolve<IFormulaResultProvider>(IFormulaResultProvider.symbol);
  resizePlugin.setProjectedCells({
    forEachProjectedCellInRange(startRow, startColumn, endRow, endColumn, visit) {
      formulaResults.forEachFormulaResultInRange?.(
        startRow, startColumn, endRow, endColumn,
        (row, col) => visit({ type: CellType.Formula }, row, col),
      );
    },
  });
  manager.registerPlugin(resizePlugin);
  manager.registerPlugin(container.resolve<SheetSelectionPlugin>(SheetSelectionPlugin.symbol));
  container.register(SheetZoomPlugin.symbol, SheetZoomPlugin, Scope.Singleton);
  manager.registerPlugin(container.resolve<SheetZoomPlugin>(SheetZoomPlugin.symbol));
  container.register(SheetHighlightPlugin.symbol, SheetHighlightPlugin, Scope.Singleton);
  manager.registerPlugin(container.resolve<SheetHighlightPlugin>(SheetHighlightPlugin.symbol));
  container.register(
    SheetFormulaReferenceHighlightPlugin.symbol,
    SheetFormulaReferenceHighlightPlugin,
    Scope.Singleton,
  );
  const formulaHighlights = container.resolve<SheetFormulaReferenceHighlightPlugin>(
    SheetFormulaReferenceHighlightPlugin.symbol,
  );
  if (container.hasBinding(FormulaCrossSheetHighlightSource.symbol)) {
    formulaHighlights.bindCrossSheetSource(
      container.resolve<FormulaCrossSheetHighlightSource>(FormulaCrossSheetHighlightSource.symbol),
    );
  }
  manager.registerPlugin(formulaHighlights);
  container.register(SheetHeaderHighlightPlugin.symbol, SheetHeaderHighlightPlugin, Scope.Singleton);
  manager.registerPlugin(container.resolve<SheetHeaderHighlightPlugin>(SheetHeaderHighlightPlugin.symbol));
}
