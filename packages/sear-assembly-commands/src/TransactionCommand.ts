import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { type Operation } from '@searsuite/sear-domain-ot';
import { createTransaction, Transaction } from '@searsuite/sear-domain-transaction';

/** Creates a transaction for command factories that need to produce pipeline transactions internally. */
export function createSheetTransaction<OperationType extends Operation>(
  target: PluginKey,
  operations: readonly OperationType[],
  meta: Readonly<Record<string, unknown>> = {},
): Transaction {
  return createTransaction<Operation>(target, operations, meta);
}

export { EffectCommand } from './transactionCommands/EffectCommand';
export { LocalActionCommand } from './transactionCommands/LocalActionCommand';
export { PipelineExecutionCommand } from './transactionCommands/PipelineExecutionCommand';
export { TransactionPipelineCommand } from './transactionCommands/TransactionPipelineCommand';
