/** Workbook name resolution used while formatting formula source. */
export interface WorkbookFormulaFormatOptions {
  readonly resolveSheetName?: (formulaSheetName: string) => string | undefined;
  readonly missingSheetName?: string;
}
