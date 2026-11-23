import {
  FormulaErrorCode,
  createFormulaError,
  type FormulaError,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';
import { isFormulaError, isFormulaText } from '@searsuite/sear-foundation-utils';

export function textOf(value: FormulaValue): string {
  if (isFormulaText(value)) return value.value;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

export function isTruthy(value: FormulaValue): boolean | FormulaError {
  if (isFormulaError(value)) return value as FormulaError;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (isFormulaText(value)) return isTruthy(value.value);
  if (typeof value === 'string') {
    const upper = value.trim().toUpperCase();
    if (upper === 'TRUE') return true;
    if (upper === 'FALSE') return false;
    if (upper === '') return createFormulaError(FormulaErrorCode.Value);
    return createFormulaError(FormulaErrorCode.Value);
  }
  return createFormulaError(FormulaErrorCode.Value);
}
