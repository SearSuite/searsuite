import { type SheetRangeInput, type SheetRangeBounds } from '@searsuite/sear-assembly-commands';
import { SearError } from '@searsuite/sear-foundation-error';

/** Validates both corners before any owner can plan or mutate state. */
export function normalizeClearStyleRange(input: SheetRangeInput, shape: readonly [number, number]): SheetRangeBounds {
  for (const point of [input?.anchor, input?.focus]) {
    if (
      !Array.isArray(point) ||
      point.length !== 2 ||
      !point.every((value) => Number.isSafeInteger(value) && value >= 0) ||
      point[0] >= shape[0] ||
      point[1] >= shape[1]
    ) {
      throw new SearError('Clear styles requires cell coordinates within the current sheet.', { input, shape });
    }
  }
  return {
    start: [Math.min(input.anchor[0], input.focus[0]), Math.min(input.anchor[1], input.focus[1])],
    end: [Math.max(input.anchor[0], input.focus[0]), Math.max(input.anchor[1], input.focus[1])],
  };
}
