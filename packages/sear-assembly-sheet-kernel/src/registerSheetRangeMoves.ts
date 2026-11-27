import { type SheetRangeMoveRegistry } from '@searsuite/sear-assembly-plugin';

interface RangeMoveRegistrar {
  registerRangeMoves(registry: SheetRangeMoveRegistry): void;
}

/** Invokes the optional range-move lifecycle hook of built-in and third-party plugins. */
export function registerSheetRangeMoves(plugins: readonly unknown[], registry: SheetRangeMoveRegistry): void {
  plugins.forEach((plugin) => {
    if (typeof (plugin as Partial<RangeMoveRegistrar>).registerRangeMoves === 'function') {
      (plugin as RangeMoveRegistrar).registerRangeMoves(registry);
    }
  });
}
