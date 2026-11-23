import { CellVisualIconShape, type CellVisualLayer } from '@searsuite/sear-render-node';
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
  const kind = rules.findRules(row, column).map(({ rule }) => rule.condition.kind).reverse()
    .find((candidate): candidate is NumericValidationControlKind =>
      candidate === DataValidationKind.Progress || candidate === DataValidationKind.Rating);
  if (!kind) return null;
  if (rawValue !== null && rawValue !== undefined && rawValue !== '' &&
    evaluateDataValidation({ kind }, String(rawValue), { row, column }) !== true) return null;
  const value = rawValue === null || rawValue === undefined || rawValue === '' ? 0 :
    typeof rawValue === 'number' || (typeof rawValue === 'string' && rawValue.trim()) ? Number(rawValue) : NaN;
  if (!Number.isFinite(value) || value < 0 || value > (kind === DataValidationKind.Progress ? 100 : 5) ||
    (kind === DataValidationKind.Rating && !Number.isInteger(value))) return null;
  return { kind, value };
}

/** Portable visual layers shared by Canvas and SVG. */
export function numericValidationControlLayers(control: NumericValidationControl): CellVisualLayer[] {
  if (control.kind === DataValidationKind.Progress) return [
    { slot: 'dataValidation.progress.track', x: 0.08, y: 0.3, width: 0.84, height: 0.4, fill: '#dce3e8' },
    { slot: 'dataValidation.progress.value', x: 0.08, y: 0.3, width: 0.84 * control.value / 100,
      height: 0.4, fill: '#168a78' },
  ];
  return Array.from({ length: 5 }, (_, index) => ({
    slot: `dataValidation.rating.${index}`,
    x: 0.02 + index * 0.19, y: 0, width: 0.18, height: 1,
    icon: { shape: CellVisualIconShape.Star, color: index < control.value ? '#d58a16' : '#b8c1c7' },
  }));
}

/** Converts a click inside the drawn control into its stored numeric value. */
export function numericValidationControlValueAt(
  control: NumericValidationControl,
  bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  x: number,
  y: number,
): number | null {
  const relativeX = (x - bounds.x) / bounds.width;
  const relativeY = (y - bounds.y) / bounds.height;
  if (control.kind === DataValidationKind.Progress) {
    if (relativeX < 0.08 || relativeX > 0.92 || relativeY < 0.15 || relativeY > 0.85) return null;
    return Math.round(((relativeX - 0.08) / 0.84) * 100);
  }
  if (relativeX < 0.02 || relativeX > 0.97 || relativeY < 0.08 || relativeY > 0.92) return null;
  const selected = Math.min(5, Math.floor((relativeX - 0.02) / 0.19) + 1);
  return selected === control.value ? 0 : selected;
}
