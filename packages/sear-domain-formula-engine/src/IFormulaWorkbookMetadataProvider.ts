import type { FormulaWorkbookMetadata } from './FormulaWorkbookMetadata';

/** Supplies workbook facts to a mounted Sheet formula evaluator. */
export interface IFormulaWorkbookMetadataProvider {
  readWorkbook(): FormulaWorkbookMetadata | undefined;
}

export namespace IFormulaWorkbookMetadataProvider {
  export const symbol = Symbol.for('IFormulaWorkbookMetadataProvider');
}
