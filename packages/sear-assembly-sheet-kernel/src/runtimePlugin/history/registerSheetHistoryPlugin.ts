import { SheetCommandBus } from '@searsuite/sear-assembly-commands';
import {
  type PluginManager,
  SheetInteractionStore,
  PluginManager as StateOwners,
} from '@searsuite/sear-assembly-plugin';
import { type Container, Scope } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';
import { SheetExternalHistory, SheetHistoryPlugin, SheetHistoryStatusProvider } from '@searsuite/sear-plugin-history';
import { SheetOwnerLifecycle } from '../../SheetOwnerLifecycle';

/** Registers editor-local history as both a feature plugin and lifecycle controller. */
export function registerSheetHistoryPlugin(container: Container, manager: PluginManager): void {
  container.registerFactory(
    SheetHistoryPlugin.symbol,
    () =>
      new SheetHistoryPlugin(
        container.resolve(StateOwners.symbol),
        container.resolve(SheetInteractionStore.symbol),
        container.resolve(Platform.symbol),
        container.resolve(SheetCommandBus.symbol),
        container.hasBinding(SheetExternalHistory.symbol) ? container.resolve(SheetExternalHistory.symbol) : undefined,
      ),
    Scope.Singleton,
  );
  const history = container.resolve<SheetHistoryPlugin>(SheetHistoryPlugin.symbol);
  container.registerInstance(SheetHistoryStatusProvider.symbol, history);
  manager.registerPlugin(history);
  container.resolve<SheetOwnerLifecycle>(SheetOwnerLifecycle.symbol).register(history);
}
