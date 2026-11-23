import { Container, Scope } from '@searsuite/sear-foundation-di';

import { PluginManager } from '@searsuite/sear-assembly-plugin';
import { ConfigEngine } from '@searsuite/sear-assembly-config';

/** Registers the small common runtime set into an explicit host container. */
export function registerDefaultDependencies(container: Container): void {
  container.register(ConfigEngine.symbol, ConfigEngine, Scope.Singleton);
  container.register(PluginManager.symbol, PluginManager, Scope.Singleton);
}
