import { Pipeline } from '@searsuite/sear-assembly-core';

import { SheetCommand, SheetCommandContext, SheetCommandResult } from '../SheetCommand';

/** Executes a complete, named pipeline through the command bus. */
export class PipelineExecutionCommand implements SheetCommand<SheetCommandResult> {
  readonly #pipeline: Pipeline;
  readonly #historyGroup: SheetCommandResult['historyGroup'] | undefined;

  /** Creates a command around an existing named pipeline. */
  public constructor(
    public readonly id: string,
    pipeline: Pipeline,
    historyGroup?: SheetCommandResult['historyGroup'],
  ) {
    this.#pipeline = pipeline;
    this.#historyGroup = historyGroup;
  }

  /** Returns the provided pipeline unchanged. */
  execute(_context: SheetCommandContext): SheetCommandResult {
    return { pipeline: this.#pipeline, ...(this.#historyGroup ? { historyGroup: this.#historyGroup } : {}) };
  }
}
