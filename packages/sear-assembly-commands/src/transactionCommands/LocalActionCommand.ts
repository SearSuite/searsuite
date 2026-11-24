import { Pipeline } from '@searsuite/sear-assembly-core';

import { SheetCommand, SheetCommandContext, SheetCommandResult } from '../SheetCommand';

/** Runs a local, command-owned action that does not produce an OT transaction. */
export class LocalActionCommand implements SheetCommand<SheetCommandResult> {
  readonly #run: () => void;

  /** Creates a command that schedules one local action in a pipeline. */
  public constructor(public readonly id: string, run: () => void) {
    this.#run = run;
  }

  /** Returns a pipeline containing only the local action step. */
  execute(_context: SheetCommandContext): SheetCommandResult {
    return { pipeline: new Pipeline(this.id).addLocalAction(this.id, this.#run) };
  }
}
