import { Pipeline } from '@searsuite/sear-assembly-core';
import type { SheetCommand, SheetCommandContext } from '@searsuite/sear-assembly-commands';
import type { IFormulaStatusProvider } from '@searsuite/sear-domain-formula-engine';
import {
  GetFormulaCellStatusCommand,
  type FormulaCellStatusCommandInput,
  type FormulaCellStatusCommandResult,
} from './FormulaStatusCommands';

export class FormulaCellStatusQueryCommand implements SheetCommand<FormulaCellStatusCommandResult> {
  public readonly id = GetFormulaCellStatusCommand.id;

  public constructor(
    private readonly provider: IFormulaStatusProvider,
    private readonly input: FormulaCellStatusCommandInput,
  ) {}

  public execute(_context: SheetCommandContext): FormulaCellStatusCommandResult {
    return {
      pipeline: new Pipeline(this.id),
      status: this.provider.getFormulaCellStatus(this.input.row, this.input.col),
    };
  }
}
