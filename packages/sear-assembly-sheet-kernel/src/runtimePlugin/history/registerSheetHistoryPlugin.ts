import { SheetOwnerLifecycle } from '../../SheetOwnerLifecycle';
import { type PluginManager } from '@searsuite/sear-assembly-plugin';
import { type Container, Scope } from '@searsuite/sear-foundation-di';
import { SheetHistoryPlugin, SheetHistoryStatusProvider } from '@searsuite/sear-plugin-history';

/** Registers editor-local history as both a feature plugin and lifecycle controller. */
export function registerSheetHistoryPlugin(container: Container, manager: PluginManager): void {
  container.register(SheetHistoryPlugin.symbol, SheetHistoryPlugin, Scope.Singleton);
  const history = container.resolve<SheetHistoryPlugin>(SheetHistoryPlugin.symbol);
  container.registerInstance(SheetHistoryStatusProvider.symbol, history);
  manager.registerPlugin(history);
  container.resolve<SheetOwnerLifecycle>(SheetOwnerLifecycle.symbol).register(history);
}
