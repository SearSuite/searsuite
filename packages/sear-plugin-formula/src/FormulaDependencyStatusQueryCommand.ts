import { Pipeline } from '@searsuite/sear-assembly-core';
import type { SheetCommand, SheetCommandContext } from '@searsuite/sear-assembly-commands';
import type { IFormulaStatusProvider } from '@searsuite/sear-domain-formula-engine';
import {
  GetFormulaDependencyStatusCommand,
  type FormulaDependencyStatusCommandInput,
  type FormulaDependencyStatusCommandResult,
} from './FormulaStatusCommands';
import { createFormulaDependencyStatus } from './FormulaDependencyStatus';

export class FormulaDependencyStatusQueryCommand implements SheetCommand<FormulaDependencyStatusCommandResult> {
  public readonly id = GetFormulaDependencyStatusCommand.id;

  public constructor(
    private readonly provider: IFormulaStatusProvider,
    private readonly input: FormulaDependencyStatusCommandInput,
  ) {}

  public execute(_context: SheetCommandContext): FormulaDependencyStatusCommandResult {
    const status = this.provider.getFormulaCellStatus(this.input.row, this.input.col);
    return {
      pipeline: new Pipeline(this.id),
      dependencyStatus: createFormulaDependencyStatus(this.provider, status, this.input),
    };
  }
}
