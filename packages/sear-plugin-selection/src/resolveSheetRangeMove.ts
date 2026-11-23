import { type SheetRangeMoveContext } from '@searsuite/sear-assembly-plugin';
import { type MoveSheetRangeInput } from './SheetRangeMoveCommands';

/** Returns the normalized source and equally sized destination. */
export function resolveSheetRangeMove(input: MoveSheetRangeInput): SheetRangeMoveContext {
  const source = {
    start: [
      Math.min(input.source.start[0], input.source.end[0]),
      Math.min(input.source.start[1], input.source.end[1]),
    ] as const,
    end: [
      Math.max(input.source.start[0], input.source.end[0]),
      Math.max(input.source.start[1], input.source.end[1]),
    ] as const,
  };
  return {
    source,
    destination: {
      start: [...input.target],
      end: [input.target[0] + source.end[0] - source.start[0], input.target[1] + source.end[1] - source.start[1]],
    },
  };
}
