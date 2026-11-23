import { type Container } from '@searsuite/sear-foundation-di';
import { type SearCoreSheet } from '@searsuite/sear-assembly-core';
import { type PluginManager, SheetFormatTransferRegistry } from '@searsuite/sear-assembly-plugin';
import { SheetClearStylePlugin } from '@searsuite/sear-plugin-clear-style';
import { SheetDataPlugin } from '@searsuite/sear-render-engine';
import { type CellProperties } from '@searsuite/sear-render-registry';

/** Shares owner contributions without coupling clear-style behavior to any concrete format feature. */
export function registerSheetClearStylePlugin(
  container: Container,
  manager: PluginManager<SearCoreSheet, CellProperties>,
): void {
  const data = container.resolve<SheetDataPlugin>(SheetDataPlugin.symbol);
  const plugin = new SheetClearStylePlugin({
    formats: container.resolve<SheetFormatTransferRegistry>(SheetFormatTransferRegistry.symbol),
    readShape: () => [...data.getState().sheetData.shape] as [number, number],
  });
  container.registerInstance(SheetClearStylePlugin.symbol, plugin);
  manager.registerPlugin(plugin);
}
