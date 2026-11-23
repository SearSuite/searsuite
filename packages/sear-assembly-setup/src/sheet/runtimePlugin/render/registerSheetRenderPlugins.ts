import { type SearCoreSheet } from '@searsuite/sear-assembly-core';
import { type PluginManager } from '@searsuite/sear-assembly-plugin';
import { type Container, Scope } from '@searsuite/sear-foundation-di';
import {
  SheetColumnLabelPlugin,
  SheetCornerPlugin,
  SheetGridPlugin,
  SheetGridRender,
  SheetRowNumberPlugin,
} from '@searsuite/sear-render';
import { SheetCellMergeRender } from '@searsuite/sear-render';
import { type CellProperties } from '@searsuite/sear-render-registry';

/** Registers render-owned plugins in the order expected by the sheet scene. */
export function registerSheetRenderPlugins(
  container: Container,
  manager: PluginManager<SearCoreSheet, CellProperties>,
): void {
  container.register(SheetCellMergeRender.symbol, SheetCellMergeRender, Scope.Singleton);
  const mergeRender = container.resolve<SheetCellMergeRender>(SheetCellMergeRender.symbol);
  manager.registerPlugin(mergeRender);
  container.register(SheetCornerPlugin.symbol, SheetCornerPlugin, Scope.Singleton);
  container.register(SheetColumnLabelPlugin.symbol, SheetColumnLabelPlugin, Scope.Singleton);
  container.register(SheetRowNumberPlugin.symbol, SheetRowNumberPlugin, Scope.Singleton);
  container.register(SheetGridRender.symbol, SheetGridRender, Scope.Singleton);
  container.register(SheetGridPlugin.symbol, SheetGridPlugin, Scope.Singleton);
  manager.registerPlugin(container.resolve<SheetGridPlugin>(SheetGridPlugin.symbol));
}
