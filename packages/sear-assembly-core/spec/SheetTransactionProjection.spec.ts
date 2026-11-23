import { projectSheetTransaction } from '../src/SheetTransactionProjection';
import { PluginKey, type PluginManager } from '@searsuite/sear-assembly-plugin';
import { type CellProperties } from '@searsuite/sear-render-registry';
import { createTransaction, TRANSACTION_ORIGIN_META_KEY, TransactionOrigin } from '@searsuite/sear-domain-transaction';
it('preserves origins, skips empty/self contributions and rejects cross-owner writes', () => {
  const owner = new PluginKey('owner'),
    root = new PluginKey('root');
  let target = owner;
  const project = jest.fn(() => [
    createTransaction(target, []),
    createTransaction(target, [{ p: [0, 0], uc: { value: 'x', prev: null } }]),
  ]);
  const manager = {
    forEach: (visit: Function) => visit({ key: owner, projectTransaction: project }),
  } as unknown as PluginManager<unknown, CellProperties>;
  const source = createTransaction(root, [], { [TRANSACTION_ORIGIN_META_KEY]: TransactionOrigin.Remote });
  const result = projectSheetTransaction(manager, source, () => ({ value: 1 }));
  expect(result).toHaveLength(1);
  expect(result[0].getMeta(TRANSACTION_ORIGIN_META_KEY)).toBe(TransactionOrigin.Remote);
  expect(projectSheetTransaction(manager, createTransaction(owner), () => null)).toEqual([]);
  target = root;
  expect(() => projectSheetTransaction(manager, source, () => null)).toThrow('contributing owner');
});
