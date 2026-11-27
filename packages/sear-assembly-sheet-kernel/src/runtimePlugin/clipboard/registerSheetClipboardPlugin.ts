import { type PluginManager } from '@searsuite/sear-assembly-plugin';
import { type Container, Scope } from '@searsuite/sear-foundation-di';

import {
  DefaultSheetClipboardCodec,
  SheetClipboardCodecSymbol,
  SheetClipboardDataSourceSymbol,
  SheetClipboardPlugin,
} from '@searsuite/sear-plugin-clipboard';

import { DefaultSheetClipboardDataSource } from '../../DefaultSheetClipboardDataSource';

/** Registers clipboard services, plugin, and keyboard shortcuts. */
export function registerSheetClipboardPlugin(container: Container, manager: PluginManager): void {
  container.register(SheetClipboardDataSourceSymbol, DefaultSheetClipboardDataSource, Scope.Singleton);
  container.register(SheetClipboardCodecSymbol, DefaultSheetClipboardCodec, Scope.Singleton);
  container.register(SheetClipboardPlugin.symbol, SheetClipboardPlugin, Scope.Singleton);
  manager.registerPlugin(container.resolve<SheetClipboardPlugin>(SheetClipboardPlugin.symbol));
}
