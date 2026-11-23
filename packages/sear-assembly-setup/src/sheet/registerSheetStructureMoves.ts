import { type SheetStructureMoveRegistry } from '@searsuite/sear-assembly-plugin';

interface StructureMoveRegistrar {
  registerStructureMoves(registry: SheetStructureMoveRegistry): void;
}

/** Invokes owner-provided structure-move planners without enumerating feature packages. */
export function registerSheetStructureMoves(plugins: readonly unknown[], registry: SheetStructureMoveRegistry): void {
  plugins.forEach((plugin) => {
    if (typeof (plugin as Partial<StructureMoveRegistrar>).registerStructureMoves === 'function') {
      (plugin as StructureMoveRegistrar).registerStructureMoves(registry);
    }
  });
}
