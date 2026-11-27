import { Pipeline } from '@searsuite/sear-assembly-plugin';
import { Transaction } from '@searsuite/sear-domain-transaction';

import { SheetCommand, SheetCommandContext, SheetCommandResult } from '../SheetCommand';

/** Executes an already-created transaction through the pipeline command boundary. */
export class TransactionPipelineCommand implements SheetCommand<SheetCommandResult> {
  readonly #transaction: Transaction;
  readonly #historyGroup: SheetCommandResult['historyGroup'] | undefined;

  /** Creates a command around an existing transaction. */
  public constructor(
    public readonly id: string,
    transaction: Transaction,
    historyGroup?: SheetCommandResult['historyGroup'],
  ) {
    this.#transaction = transaction;
    this.#historyGroup = historyGroup;
  }

  /** Converts the provided transaction into a pipeline result. */
  execute(_context: SheetCommandContext): SheetCommandResult {
    return {
      pipeline: Pipeline.fromTransaction(this.id, this.#transaction),
      ...(this.#historyGroup ? { historyGroup: this.#historyGroup } : {}),
    };
  }
}
