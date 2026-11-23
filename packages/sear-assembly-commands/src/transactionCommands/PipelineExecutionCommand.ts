import { Pipeline } from '@searsuite/sear-assembly-core';

import { SheetCommand, SheetCommandContext, SheetCommandResult } from '../SheetCommand';

/** Executes a complete, named pipeline through the command bus. */
export class PipelineExecutionCommand implements SheetCommand<SheetCommandResult> {
  /** Creates a command around an existing named pipeline. */
  public constructor(
    public readonly id: string,
    private readonly pipeline: Pipeline,
    private readonly historyGroup?: SheetCommandResult['historyGroup'],
  ) {}

  /** Returns the provided pipeline unchanged. */
  execute(_context: SheetCommandContext): SheetCommandResult {
    return { pipeline: this.pipeline, ...(this.historyGroup ? { historyGroup: this.historyGroup } : {}) };
  }
}
