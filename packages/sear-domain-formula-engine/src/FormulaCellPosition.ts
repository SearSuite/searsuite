/** Position of the formula currently being evaluated. */
export interface FormulaCellPosition {
  readonly row: number;
  readonly col: number;
  readonly sheetId?: string;
  readonly sheetName?: string;
}
