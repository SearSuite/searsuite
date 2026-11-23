/** Host-neutral execution budget for formula evaluation. */
export interface FormulaEvaluationBudget {
  readonly maxSteps: number;
  consumeStep(): boolean;
}
