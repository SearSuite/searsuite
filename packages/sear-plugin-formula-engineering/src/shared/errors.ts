import { FormulaErrorCode, createFormulaError, type FormulaError } from '@searsuite/sear-domain-formula-engine';

export const valueError = (): FormulaError => createFormulaError(FormulaErrorCode.Value);
export const nameError = (): FormulaError => createFormulaError(FormulaErrorCode.Name);
export const numberError = (): FormulaError => createFormulaError(FormulaErrorCode.Number);
export const divisionError = (): FormulaError => createFormulaError(FormulaErrorCode.DivisionByZero);
export const notAvailableError = (): FormulaError => createFormulaError(FormulaErrorCode.NotAvailable);

export function isFormulaError(value: unknown): value is FormulaError {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'error';
}
