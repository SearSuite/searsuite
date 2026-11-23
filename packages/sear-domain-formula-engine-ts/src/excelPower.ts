import { FormulaErrorCode, createFormulaError, type FormulaError } from '@searsuite/sear-domain-formula-engine';

/** Evaluates exponentiation with Excel-compatible error results. */
export function excelPower(base: number, exponent: number): number | FormulaError {
  if (base === 0 && exponent < 0) {
    return createFormulaError(FormulaErrorCode.DivisionByZero);
  }

  const result = Math.pow(base, exponent);
  return Number.isFinite(result) ? result : createFormulaError(FormulaErrorCode.Number);
}
