import { type SheetRangeInput, type SheetRangeBounds } from '@searsuite/sear-assembly-commands';
import { CellBorderError } from './CellBorderValidation';

/** Normalizes an inclusive range against the border matrix shape. */
export function normalizeBorderRange(input: SheetRangeInput, shape: readonly number[]): SheetRangeBounds {
  for (const point of [input.anchor, input.focus]) {
    if (
      !Array.isArray(point) ||
      point.length !== 2 ||
      point.some((value) => !Number.isInteger(value)) ||
      point[0] < 0 ||
      point[1] < 0 ||
      point[0] >= shape[0] ||
      point[1] >= shape[1]
    )
      throw new CellBorderError('Border range is outside the sheet.', { input, shape });
  }
  return {
    start: [Math.min(input.anchor[0], input.focus[0]), Math.min(input.anchor[1], input.focus[1])],
    end: [Math.max(input.anchor[0], input.focus[0]), Math.max(input.anchor[1], input.focus[1])],
  };
}
