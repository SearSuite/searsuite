import { type DataValidationMatrix } from './DataValidationMatrix';
import { DataValidationKind } from './DataValidationRule';
import { evaluateDataValidation } from './evaluateDataValidation';

export type NumericValidationControlKind = typeof DataValidationKind.Progress | typeof DataValidationKind.Rating;
export interface NumericValidationControl {
  readonly kind: NumericValidationControlKind;
  readonly value: number;
}

/** Reads the last numeric control rule without replacing an invalid cell's visible text. */
export function readNumericValidationControl(
  rules: DataValidationMatrix,
  row: number,
  column: number,
  rawValue: unknown,
): NumericValidationControl | null {
  const kind = rules
    .findRules(row, column)
    .map(({ rule }) => rule.condition.kind)
    .reverse()
    .find(
      (candidate): candidate is NumericValidationControlKind =>
        candidate === DataValidationKind.Progress || candidate === DataValidationKind.Rating,
    );
  if (!kind) return null;
  if (
    rawValue !== null &&
    rawValue !== undefined &&
    rawValue !== '' &&
    evaluateDataValidation({ kind }, String(rawValue), { row, column }) !== true
  )
    return null;
  const value =
    rawValue === null || rawValue === undefined || rawValue === ''
      ? 0
      : typeof rawValue === 'number' || (typeof rawValue === 'string' && rawValue.trim())
      ? Number(rawValue)
      : NaN;
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > (kind === DataValidationKind.Progress ? 100 : 5) ||
    (kind === DataValidationKind.Rating && !Number.isInteger(value))
  )
    return null;
  return { kind, value };
}
