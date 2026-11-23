import { createTransaction, type Transaction } from '@searsuite/sear-domain-transaction';
import { type Plugin, type PluginManager, type PluginKey } from '@searsuite/sear-assembly-plugin';
import { type CellProperties } from '@searsuite/sear-render-registry';
import { SearError } from '@searsuite/sear-foundation-error';
/** Plans prerequisites once, retaining original origin metadata and each contributor's ownership. */
export function projectSheetTransaction<Core>(
  plugins: PluginManager<Core, CellProperties>,
  transaction: Transaction,
  readState: (plugin: Plugin<Core, CellProperties, unknown>) => unknown,
): readonly Transaction[] {
  const result: Transaction[] = [];
  plugins.forEach((plugin) => {
    if (!plugin.projectTransaction || plugin.key === transaction.pluginKey) return;
    for (const projected of plugin.projectTransaction(readState(plugin), transaction)) {
      if (projected.pluginKey !== plugin.key)
        throw new SearError('Transaction projection must target its contributing owner.', {
          owner: plugin.key.key,
          target: projected.pluginKey.key,
        });
      if (projected.operations.length)
        result.push(
          createTransaction(projected.pluginKey, projected.operations, { ...projected.meta, ...transaction.meta }),
        );
    }
  });
  return result;
}
