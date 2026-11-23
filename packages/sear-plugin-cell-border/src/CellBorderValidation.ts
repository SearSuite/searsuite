import { SearError } from '@searsuite/sear-foundation-error';
import {
  SheetBorderLineStyle,
  SheetBorderPreset,
  SheetBorderSide,
  type SheetCellBorder,
  type SheetBorderStroke,
} from './SheetCellBorder';

/** Typed error for invalid border commands or document values. */
export class CellBorderError extends SearError {
  public override readonly code = 'SHEET_CELL_BORDER_INVALID';
  public constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, details);
  }
}

/** Validates a canonical range-border preset. */
export function assertBorderPreset(value: unknown): asserts value is SheetBorderPreset {
  if (!Object.values(SheetBorderPreset).includes(value as SheetBorderPreset))
    throw new CellBorderError('Unsupported border preset.', { value });
}

/** Validates the persisted color and line style. */
export function assertBorderStroke(value: unknown): asserts value is SheetBorderStroke {
  const stroke = value as SheetBorderStroke | null;
  if (
    !stroke ||
    typeof stroke.color !== 'string' ||
    !/^#(?:[a-f\d]{3}|[a-f\d]{4}|[a-f\d]{6}|[a-f\d]{8})$/i.test(stroke.color) ||
    !Object.values(SheetBorderLineStyle).includes(stroke.style)
  )
    throw new CellBorderError('Border strokes require a hexadecimal color and a supported line style.', { value });
}

/** Validates and isolates one sparse edge record. */
export function cloneCellBorder(value: unknown): SheetCellBorder | null {
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new CellBorderError('Invalid cell border.', { value });
  const result: Partial<Record<SheetBorderSide, SheetBorderStroke>> = {};
  for (const [side, stroke] of Object.entries(value as object)) {
    if (!Object.values(SheetBorderSide).includes(side as SheetBorderSide))
      throw new CellBorderError('Unsupported border side.', { side });
    assertBorderStroke(stroke);
    result[side as SheetBorderSide] = { color: stroke.color, style: stroke.style };
  }
  return Object.keys(result).length ? result : null;
}
