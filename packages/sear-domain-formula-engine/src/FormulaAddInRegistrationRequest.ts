/** Identifies one procedure exposed by a host-managed add-in. */
export interface FormulaAddInRegistrationRequest {
  readonly module: string;
  readonly procedure: string;
  readonly typeText?: string;
}
