import type { SheetClipboardTransferRegistrar, SheetClipboardTransferRegistry } from '@searsuite/sear-assembly-plugin';

/** Invokes the clipboard-transfer lifecycle for built-in and third-party owners. */
export function registerSheetClipboardTransfers(
  plugins: readonly unknown[],
  registry: SheetClipboardTransferRegistry,
): void {
  plugins.forEach((plugin) => {
    (plugin as Partial<SheetClipboardTransferRegistrar>).registerClipboardTransfers?.(registry);
  });
}
