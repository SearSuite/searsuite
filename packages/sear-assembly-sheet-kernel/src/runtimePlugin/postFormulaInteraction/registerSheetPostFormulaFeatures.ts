import { type Container } from '@searsuite/sear-foundation-di';
import { type PluginManager } from '@searsuite/sear-assembly-plugin';
import { SheetResizePlugin, type SheetResizeDimensions } from '@searsuite/sear-plugin-resize';
import { SheetSelectionPlugin } from '@searsuite/sear-plugin-selection';
/** Registers dimension and selection state owners after formula providers are ready. */
export function registerSheetPostFormulaFeatures(
  container: Container,
  manager: PluginManager,
  dimensions: SheetResizeDimensions,
): void {
  const resize = new SheetResizePlugin(dimensions);
  container.registerInstance(SheetResizePlugin.symbol, resize);
  manager.registerPlugin(resize);
  manager.registerPlugin(container.resolve<SheetSelectionPlugin>(SheetSelectionPlugin.symbol));
}
