/**
 * Transaction contracts for pipelines and operation ownership.
 *
 * @packageDocumentation
 */

import { type Operation, type OTOperation } from '@searsuite/sear-domain-ot';
export {};

/** Metadata key describing where a transaction originated. */
export const TRANSACTION_ORIGIN_META_KEY = 'transaction:origin';

/** Stable transaction origins observed by cross-cutting runtime features. */
export enum TransactionOrigin {
  Local = 'local',
  Remote = 'remote',
  History = 'history',
}

const transactionFactoryToken = Symbol('TransactionFactory');

// export interface Transaction {
//     pluginKey: PluginKey,
// }

/** Stable owner key accepted by a transaction. */
export interface TransactionPluginKey {
  /** String identity for the plugin or state owner receiving this transaction. */
  readonly key: string;
}

/** Transaction public API. */
export class Transaction<OperationType extends OTOperation = Operation> {
  // private type: TransactionType = TransactionType.initialize;
  /** Stable plugin key for Transaction. */
  public readonly pluginKey: TransactionPluginKey;
  /** Operations carried by Transaction. */
  public readonly operations: OperationType[] = [];
  /** Metadata attached to Transaction. */
  public readonly meta: Record<string, unknown> = {};

  /** @internal Transactions are constructed only by createTransaction(). */
  constructor(pluginKey: TransactionPluginKey, factoryToken: typeof transactionFactoryToken) {
    if (factoryToken !== transactionFactoryToken)
      throw new TypeError('Transaction must be created through createTransaction().');
    this.pluginKey = pluginKey;
  }

  /** Updates the meta. */
  setMeta(key: string, value: unknown): this {
    this.meta[key] = value;
    return this;
  }

  /** Returns the meta. */
  getMeta<T>(key: string): T | undefined {
    return this.meta[key] as T | undefined;
  }

  /** Adds the operation. */
  addOperation(operations: OperationType[]) {
    this.operations.push(...operations);
  }

  // setTransactionType(type: TransactionType) {
  //     this.type = type;
  // }
}

/** Creates a transaction with copied operations and metadata. */
export function createTransaction<OperationType extends OTOperation = Operation>(
  pluginKey: TransactionPluginKey,
  operations: readonly OperationType[] = [],
  meta: Readonly<Record<string, unknown>> = {},
): Transaction<OperationType> {
  const transaction = new Transaction<OperationType>(pluginKey, transactionFactoryToken);
  transaction.addOperation([...operations]);
  Object.entries(meta).forEach(([key, value]) => transaction.setMeta(key, value));
  return transaction;
}
