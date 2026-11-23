import { type SheetFormatRange } from '@searsuite/sear-assembly-plugin';
import { SearError } from '@searsuite/sear-foundation-error';

/** Validates before capture/planning so invalid targets cannot partially mutate owners. */
export function normalizeFormatPainterRange(
  range: SheetFormatRange,
  shape: readonly [number, number],
): SheetFormatRange {
  const points = [...range.start, ...range.end];
  if (!points.every((point) => Number.isSafeInteger(point) && point >= 0)) {
    throw new SearError('Format painter requires nonnegative integer coordinates.', { range });
  }
  const start = [Math.min(range.start[0], range.end[0]), Math.min(range.start[1], range.end[1])] as const;
  const end = [Math.max(range.start[0], range.end[0]), Math.max(range.start[1], range.end[1])] as const;
  if (end[0] >= shape[0] || end[1] >= shape[1])
    throw new SearError('Format painter range exceeds sheet bounds.', { range, shape });
  return Object.freeze({ start: Object.freeze(start), end: Object.freeze(end) });
}
