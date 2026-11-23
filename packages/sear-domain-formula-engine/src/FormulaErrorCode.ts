/** Canonical Excel-compatible formula error code values. */
export const FormulaErrorCode = {
  Reference: '#REF!',
  DivisionByZero: '#DIV/0!',
  Name: '#NAME?',
  Value: '#VALUE!',
  NotAvailable: '#N/A',
  NullIntersection: '#NULL!',
  Spill: '#SPILL!',
  Calculation: '#CALC!',
  Number: '#NUM!',
} as const;

/** Type contract carried by the canonical FormulaErrorCode value. */
export type FormulaErrorCode = (typeof FormulaErrorCode)[keyof typeof FormulaErrorCode];
