import { type SheetRangeReorderRegistry } from '@searsuite/sear-assembly-plugin';

interface RangeReorderRegistrar {
  registerRangeReorders(registry: SheetRangeReorderRegistry): void;
}

/** Invokes owner-provided range-reorder planners, including third-party plugins. */
export function registerSheetRangeReorders(plugins: readonly unknown[], registry: SheetRangeReorderRegistry): void {
  plugins.forEach((plugin) => {
    if (typeof (plugin as Partial<RangeReorderRegistrar>).registerRangeReorders === 'function')
      (plugin as RangeReorderRegistrar).registerRangeReorders(registry);
  });
}
