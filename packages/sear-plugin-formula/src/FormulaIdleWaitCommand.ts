import { Pipeline } from '@searsuite/sear-assembly-core';
import type { SheetCommand, SheetCommandContext } from '@searsuite/sear-assembly-commands';
import {
  WaitForFormulaIdleCommand,
  type FormulaIdleCommandResult,
  type FormulaIdleProvider,
} from './FormulaStatusCommands';

export class FormulaIdleWaitCommand implements SheetCommand<FormulaIdleCommandResult> {
  public readonly id = WaitForFormulaIdleCommand.id;

  public constructor(private readonly provider: FormulaIdleProvider) {}

  public execute(_context: SheetCommandContext): FormulaIdleCommandResult {
    return { pipeline: new Pipeline(this.id), idle: this.provider.waitForIdle() };
  }
}
