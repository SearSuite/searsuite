import { Pipeline } from '@searsuite/sear-assembly-plugin';

import { SheetCommand, SheetCommandContext, SheetCommandEffect, SheetCommandResult } from '../SheetCommand';

/** Command that emits local effects without mutating OT state. */
export class EffectCommand implements SheetCommand<SheetCommandResult> {
  readonly #effects: readonly SheetCommandEffect[];

  /** Creates an effect-only command. */
  public constructor(effects: readonly SheetCommandEffect[]) {
    this.#effects = effects;
  }

  /** Stable id for effect-only command execution. */
  public readonly id = 'effect.apply';

  /** Returns an empty pipeline plus the local effects to apply. */
  public execute(_context: SheetCommandContext): SheetCommandResult {
    return { pipeline: new Pipeline(this.id), effects: this.#effects };
  }
}
