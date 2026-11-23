/** Reads persisted phonetic text without coupling formulas to a cell schema. */
export interface FormulaPhoneticReader {
  getCellPhonetic(row: number, col: number): string | undefined;
  getWorkbookCellPhonetic?(sheetName: string, row: number, col: number): string | undefined;
}
