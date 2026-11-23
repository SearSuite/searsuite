import { Plugin } from '@searsuite/sear-assembly-plugin';
import { type CellProperties } from '@searsuite/sear-render-registry';
import { type SearCoreSheet } from '@searsuite/sear-assembly-core';

type TeardownMethod = (...args: unknown[]) => unknown;

/** Keeps retained plugin instances from clearing live editor sessions directly. */
export function sealSheetPluginTeardownWrites(
  plugins: readonly Plugin<SearCoreSheet, CellProperties, unknown>[],
  assertWrite: () => void,
): void {
  for (const plugin of plugins) {
    Plugin.prototype.sealRuntimeMethods.call(plugin);
    Plugin.prototype.enforceRuntimeWriteBoundary.call(plugin, assertWrite);
    const methods = plugin as unknown as Record<string, unknown>;
    for (const name of ['destroy', 'dispose', 'onEditorDestroy']) {
      const original = methods[name];
      if (typeof original !== 'function') continue;
      Object.defineProperty(plugin, name, {
        configurable: false,
        writable: false,
        value: (...args: unknown[]) => {
          assertWrite();
          return (original as TeardownMethod).apply(plugin, args);
        },
      });
    }
  }
}
