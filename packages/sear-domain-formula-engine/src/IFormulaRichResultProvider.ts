import type { FormulaRichResult } from './FormulaRichResult';

/** Read-only provider for non-text visual results produced by formula cells. */
export interface IFormulaRichResultProvider {
  getFormulaRichResult(row: number, col: number): FormulaRichResult | undefined;
}

export namespace IFormulaRichResultProvider {
  export const symbol = Symbol.for('IFormulaRichResultProvider');
}
