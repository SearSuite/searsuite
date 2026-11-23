import { type FormulaEvaluationBudget } from '@searsuite/sear-domain-formula-engine';

/** Mutable, deterministic guard against unbounded formula work. */
export class FormulaExecutionBudget implements FormulaEvaluationBudget {
  private steps = 0;

  public constructor(public readonly maxSteps = 100_000) {}

  public consumeStep(): boolean {
    this.steps++;
    return this.steps <= this.maxSteps;
  }

}
