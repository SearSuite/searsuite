import { type FormulaError } from './FormulaError';

/** Returns whether a formula value is an error value. */
export function isFormulaError(value: unknown): value is FormulaError {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'error';
}
