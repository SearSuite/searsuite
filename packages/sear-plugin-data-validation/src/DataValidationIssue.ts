/** A definite failure of the current cell value against a validation rule. */
export interface DataValidationIssue {
  readonly row: number;
  readonly column: number;
  readonly ruleId: string;
  readonly message: string;
}
