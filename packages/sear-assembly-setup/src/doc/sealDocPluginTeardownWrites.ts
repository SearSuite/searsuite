import { type DocPlugin } from '@searsuite/sear-assembly-doc';
import { Plugin } from '@searsuite/sear-assembly-plugin';

/** Keeps retained Doc plugins from releasing a live editor's session and listeners. */
export function sealDocPluginTeardownWrites(plugins: readonly DocPlugin<unknown>[], assertWrite: () => void): void {
  for (const plugin of plugins) {
    Plugin.prototype.sealRuntimeMethods.call(plugin);
    Plugin.prototype.enforceRuntimeWriteBoundary.call(plugin, assertWrite);
    const original = plugin.onEditorDestroy;
    if (!original) continue;
    Object.defineProperty(plugin, 'onEditorDestroy', {
      configurable: false,
      writable: false,
      value: (...args: Parameters<typeof original>) => {
        assertWrite();
        return original.apply(plugin, args);
      },
    });
  }
}
