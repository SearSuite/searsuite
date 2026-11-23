import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { MatrixOTActionName } from '@searsuite/sear-domain-ot';

import { createTransaction, TRANSACTION_ORIGIN_META_KEY, Transaction, TransactionOrigin } from '../src';

describe('Transaction', () => {
  it('retains its target, appends operations and exposes typed metadata', () => {
    const key = new PluginKey('transaction');
    const transaction = createTransaction(key).setMeta('source', 'keyboard').setMeta('retry', 2);

    transaction.addOperation([
      {
        p: [1, 2],
        [MatrixOTActionName.UpdateCell]: { value: null, prev: null },
      },
    ]);

    expect(transaction.pluginKey).toBe(key);
    expect(transaction.operations).toEqual([
      {
        p: [1, 2],
        [MatrixOTActionName.UpdateCell]: { value: null, prev: null },
      },
    ]);
    expect(transaction.getMeta<string>('source')).toBe('keyboard');
    expect(transaction.getMeta<number>('retry')).toBe(2);
    expect(transaction.getMeta('missing')).toBe(void 0);
    expect(TRANSACTION_ORIGIN_META_KEY).toBe('transaction:origin');
    expect(Object.values(TransactionOrigin)).toEqual(['local', 'remote', 'history']);
  });

  it('creates transactions with copied operation lists and metadata', () => {
    const key = new PluginKey('factory');
    const operations = [
      {
        p: [0, 0],
        [MatrixOTActionName.UpdateCell]: { value: 'next', prev: null },
      },
    ];
    const meta = { source: 'command' };

    const transaction = createTransaction(key, operations, meta);
    operations.length = 0;
    meta.source = 'changed';

    expect(transaction.pluginKey).toBe(key);
    expect(transaction.operations).toEqual([
      {
        p: [0, 0],
        [MatrixOTActionName.UpdateCell]: { value: 'next', prev: null },
      },
    ]);
    expect(transaction.meta).toEqual({ source: 'command' });
  });

  it('rejects construction that bypasses createTransaction', () => {
    const key = new PluginKey('direct-construction');

    expect(() => new (Transaction as unknown as new (pluginKey: PluginKey) => Transaction)(key)).toThrow(
      'Transaction must be created through createTransaction()',
    );
  });
});
