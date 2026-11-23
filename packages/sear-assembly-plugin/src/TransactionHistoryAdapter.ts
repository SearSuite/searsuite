import { createTransaction, Transaction } from '@searsuite/sear-domain-transaction';

import { type PluginTransactionHistoryAdapter } from './Plugin';

type TransactionOperations = Transaction['operations'];

/** Operation-level functions used to build one plugin-owned history adapter. */
export interface PluginTransactionHistoryOperations {
  /** Reverses an operation list in rollback order. */
  invert(operations: TransactionOperations): TransactionOperations;
  /** Rebases an operation list over operations that committed later. */
  transform(operations: TransactionOperations, other: TransactionOperations): TransactionOperations;
}

/** Creates a transaction history adapter while preserving owner identity and metadata. */
export function createPluginTransactionHistoryAdapter(
  operations: PluginTransactionHistoryOperations,
): PluginTransactionHistoryAdapter {
  return {
    invert(transaction): Transaction | null {
      const inverted = operations.invert(transaction.operations);
      return inverted.length > 0 ? createTransaction(transaction.pluginKey, inverted) : null;
    },
    transform(transaction, other): Transaction | null {
      const transformed = operations.transform(transaction.operations, other.operations);
      return transformed.length > 0 ? createTransaction(transaction.pluginKey, transformed, transaction.meta) : null;
    },
  };
}
