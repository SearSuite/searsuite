import { Pipeline } from '@searsuite/sear-assembly-plugin';
import type { SheetCommand, SheetCommandContext } from '@searsuite/sear-assembly-commands';
import {
  WaitForFormulaIdleCommand,
  type FormulaIdleCommandResult,
  type FormulaIdleProvider,
} from './FormulaStatusCommands';

export class FormulaIdleWaitCommand implements SheetCommand<FormulaIdleCommandResult> {
  readonly #provider: FormulaIdleProvider;

  public readonly id = WaitForFormulaIdleCommand.id;

  public constructor(provider: FormulaIdleProvider) {
    this.#provider = provider;
  }

  public execute(_context: SheetCommandContext): FormulaIdleCommandResult {
    return { pipeline: new Pipeline(this.id), idle: this.#provider.waitForIdle() };
  }
}
