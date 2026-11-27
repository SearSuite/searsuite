import { WorkbookPlugin } from './WorkbookPluginContracts';

/** Protects plugin cleanup entry points while the Workbook is active. */
export function sealWorkbookPluginTeardownWrites(plugins: readonly WorkbookPlugin[], assertWrite: () => void): void {
  for (const plugin of plugins) {
    WorkbookPlugin.prototype.enforceRuntimeWriteBoundary.call(plugin, assertWrite);
    const original = plugin.onWorkbookDestroy;
    if (!original) continue;
    Object.defineProperty(plugin, 'onWorkbookDestroy', {
      configurable: false,
      writable: false,
      value: (...args: Parameters<typeof original>) => {
        assertWrite();
        return original.apply(plugin, args);
      },
    });
  }
}
