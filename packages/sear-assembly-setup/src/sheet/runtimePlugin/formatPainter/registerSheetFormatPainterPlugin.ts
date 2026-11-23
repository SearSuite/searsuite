import { type Container } from '@searsuite/sear-foundation-di';
import { type SearCoreSheet } from '@searsuite/sear-assembly-core';
import {
  SheetFormatTransferRegistry,
  type SheetFormatTransferRegistrar,
  type PluginManager,
} from '@searsuite/sear-assembly-plugin';
import { SheetFormatPainterPlugin, SheetFormatPainterSession } from '@searsuite/sear-plugin-format-painter';
import { SheetDataPlugin } from '@searsuite/sear-render-engine';
import { Platform } from '@searsuite/sear-foundation-platform';
import { type CellProperties } from '@searsuite/sear-render-registry';

/** Wires format painting without moving any format state out of its owner. */
export function registerSheetFormatPainterPlugin(
  container: Container,
  manager: PluginManager<SearCoreSheet, CellProperties>,
): void {
  const formats = container.resolve<SheetFormatTransferRegistry>(SheetFormatTransferRegistry.symbol);
  const data = container.resolve<SheetDataPlugin>(SheetDataPlugin.symbol);
  const painter = new SheetFormatPainterPlugin({
    formats,
    platform: container.resolve<Platform>(Platform.symbol),
    readShape: () => [...data.getState().sheetData.shape] as [number, number],
    ...(container.hasBinding(SheetFormatPainterSession.symbol)
      ? { session: container.resolve<SheetFormatPainterSession>(SheetFormatPainterSession.symbol) }
      : {}),
  });
  container.registerInstance(SheetFormatPainterPlugin.symbol, painter);
  manager.registerPlugin(painter);
}

/** Invokes the same format-transfer lifecycle for built-in and third-party owners. */
export function registerSheetFormatTransfers(plugins: readonly unknown[], formats: SheetFormatTransferRegistry): void {
  plugins.forEach((plugin) => {
    const owner = plugin as Partial<SheetFormatTransferRegistrar>;
    owner.registerFormatTransfers?.(formats);
  });
}
