/** Stable workbook sheet identity and one-based display position. */
export interface FormulaSheetMetadata {
  readonly id: string;
  readonly name: string;
  readonly index: number;
  readonly visible?: boolean;
}
