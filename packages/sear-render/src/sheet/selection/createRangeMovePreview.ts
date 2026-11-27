import { SheetRangeMoveStatus, type SheetRangeMoveAnalysis } from '@searsuite/sear-assembly-plugin';
import { type SheetRangeHighlight } from '../highlight/SheetHighlightRegistry';

const strokes = {
  [SheetRangeMoveStatus.Allowed]: '#16834b',
  [SheetRangeMoveStatus.RequiresConfirmation]: '#b7791f',
  [SheetRangeMoveStatus.Blocked]: '#c53030',
};

/** Paints the assessed destination without changing its dimensions or topology. */
export function createRangeMovePreview(analysis: SheetRangeMoveAnalysis): SheetRangeHighlight {
  return {
    start: [...analysis.context.destination.start],
    end: [...analysis.context.destination.end],
    stroke: strokes[analysis.status],
    strokeWidth: 2,
    depth: 4,
    skipHit: true,
  };
}
