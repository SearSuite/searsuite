import { isFormulaText } from './FormulaValueGuards';

/** Converts a formula value for aggregate functions; non-numeric values are 0. */
export function toNumberOrZero(value: unknown): number {
  if (isFormulaText(value)) return value.numericCoercion === 'allow' ? toNumberOrZero(value.value) : 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : 0;
  }
  return 0;
}

/** Converts a value for scalar arithmetic, returning an Excel #VALUE! error when invalid. */
export function toNumberOrError(value: unknown): number | { kind: 'error'; code: '#VALUE!' } {
  if (isFormulaText(value)) {
    if (value.numericCoercion === 'deny') {
      const percent = parsePercent(value.value);
      return percent ?? { kind: 'error', code: '#VALUE!' };
    }
    return toNumberOrError(value.value);
  }
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') {
    if (value === '') return 0;
    const percent = parsePercent(value);
    if (percent !== null) return percent;
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return { kind: 'error', code: '#VALUE!' };
    return numberValue;
  }
  return { kind: 'error', code: '#VALUE!' };
}

function parsePercent(value: string): number | null {
  const match = /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*%\s*$/.exec(value);
  return match ? Number(match[1]) / 100 : null;
}
