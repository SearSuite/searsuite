/** Parsed Excel-compatible date/time serial and source components. */
export interface FormulaDateTimeParseResult {
  readonly serial: number;
  readonly hasDate: boolean;
  readonly hasTime: boolean;
}
