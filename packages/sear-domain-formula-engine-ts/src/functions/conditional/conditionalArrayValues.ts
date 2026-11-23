import { FormulaErrorCode, createFormulaError, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { mapArrayValues } from '../shared/arrayArgumentValues';

export function conditionalValueAt(value: FormulaValue, row: number, col: number): FormulaValue {
  if (!Array.isArray(value)) return value;
  const sourceRow = value[value.length === 1 ? 0 : row];
  if (sourceRow === undefined) return createFormulaError(FormulaErrorCode.NotAvailable);
  if (!Array.isArray(sourceRow)) return sourceRow;
  const sourceValue = sourceRow[sourceRow.length === 1 ? 0 : col];
  return sourceValue === undefined ? createFormulaError(FormulaErrorCode.NotAvailable) : sourceValue;
}

export function replaceConditionalErrors(
  value: FormulaValue,
  fallback: () => FormulaValue,
  shouldReplace: (value: FormulaValue) => boolean,
): FormulaValue {
  if (!Array.isArray(value)) return shouldReplace(value) ? fallback() : value;
  let replacement: FormulaValue | undefined;
  let evaluated = false;
  return mapArrayValues(value, (cell, rowIndex, columnIndex) => {
    if (!shouldReplace(cell)) return cell;
    if (!evaluated) {
      replacement = fallback();
      evaluated = true;
    }
    return conditionalValueAt(replacement!, rowIndex, columnIndex);
  });
}
