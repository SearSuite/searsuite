import { type SheetCellStyleDefaults, type SheetCellStyleRegistry } from '@searsuite/sear-domain-cell-types';

/** Feature-owned, renderer-independent style projection. */
export interface SheetCellStyleRegistrar {
  registerCellStyles(registry: SheetCellStyleRegistry, defaults: SheetCellStyleDefaults): void;
}

export function registerSheetPluginCellStyles(
  plugins: readonly unknown[],
  registry: SheetCellStyleRegistry,
  defaults: SheetCellStyleDefaults,
): void {
  for (const plugin of plugins) {
    if (typeof (plugin as Partial<SheetCellStyleRegistrar>).registerCellStyles === 'function') {
      (plugin as SheetCellStyleRegistrar).registerCellStyles(registry, defaults);
    }
  }
}
