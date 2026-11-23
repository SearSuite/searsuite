import { Pipeline } from '@searsuite/sear-assembly-core';
import { Transaction } from '@searsuite/sear-domain-transaction';

import { SheetCommand, SheetCommandContext, SheetCommandResult } from '../SheetCommand';

/** Executes an already-created transaction through the pipeline command boundary. */
export class TransactionPipelineCommand implements SheetCommand<SheetCommandResult> {
  /** Creates a command around an existing transaction. */
  public constructor(
    public readonly id: string,
    private readonly transaction: Transaction,
    private readonly historyGroup?: SheetCommandResult['historyGroup'],
  ) {}

  /** Converts the provided transaction into a pipeline result. */
  execute(_context: SheetCommandContext): SheetCommandResult {
    return {
      pipeline: Pipeline.fromTransaction(this.id, this.transaction),
      ...(this.historyGroup ? { historyGroup: this.historyGroup } : {}),
    };
  }
}
