import { type PluginManager } from '@searsuite/sear-assembly-plugin';
import { type SearCoreDoc } from '@searsuite/sear-assembly-core';
import { type NodeProperties } from '@searsuite/sear-render-node';
import { type Container } from '@searsuite/sear-foundation-di';
import { DefaultDocFeaturePlugins } from './DefaultDocFeaturePlugins';
import { type DocPlugin, type DocPluginImplementation } from '@searsuite/sear-assembly-doc';

/** Registers the default document feature plugins selected for one editor instance. */
export function registerDefaultDocFeatures(
  container: Container,
  manager: PluginManager<SearCoreDoc, NodeProperties>,
  implementations: readonly DocPluginImplementation<DocPlugin<unknown>>[] | false | undefined,
): DocPlugin<unknown>[] {
  if (implementations === false) return [];
  return registerDocFeaturePlugins(container, manager, implementations ?? DefaultDocFeaturePlugins);
}

/** Registers document feature plugin instances with the Core-owned PluginManager. */
export function registerDocFeaturePlugins(
  container: Container,
  manager: PluginManager<SearCoreDoc, NodeProperties>,
  implementations: readonly DocPluginImplementation<DocPlugin<unknown>>[] | undefined,
): DocPlugin<unknown>[] {
  return (
    implementations?.map((implementation) => {
      const plugin = container.resolve<DocPlugin<unknown>>(implementation.symbol);
      manager.registerPlugin(plugin);
      return plugin;
    }) ?? []
  );
}
