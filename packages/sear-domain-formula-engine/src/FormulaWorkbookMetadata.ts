import { type FormulaSheetMetadata } from './FormulaSheetMetadata';

/** Read-only workbook facts consumed by information formulas. */
export interface FormulaWorkbookMetadata {
  readonly currentSheetId?: string;
  readonly currentSheetName?: string;
  readonly sheets: readonly FormulaSheetMetadata[];
}
