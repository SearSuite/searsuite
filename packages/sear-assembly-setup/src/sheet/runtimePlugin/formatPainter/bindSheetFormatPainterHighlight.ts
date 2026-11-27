import { type CursorEngine, CursorToken } from '@searsuite/sear-render-cursor';
import { type SheetHighlightRegistry } from '@searsuite/sear-render';
import { FormatPainterObservation } from '@searsuite/sear-plugin-format-painter';
import { type ObservationRegistry } from '@searsuite/sear-foundation-subscription';

/** Projects the local painter source through the existing range-decoration extension. */
export function bindSheetFormatPainterHighlight(
  highlights: SheetHighlightRegistry,
  observations: ObservationRegistry,
  cursor: CursorEngine,
): () => void {
  let source = observations.getSnapshot(FormatPainterObservation).source;
  const unregister = highlights.register({
    key: 'sheet.formatPainter.source',
    getHighlights: () =>
      source
        ? [{ start: [...source.start], end: [...source.end], stroke: '#1677ff', strokeWidth: 2, skipHit: true }]
        : [],
  });
  const unsubscribe = observations.subscribe(FormatPainterObservation, (state) => {
    source = state.source;
    cursor.override(state.mode ? CursorToken.Copy : null);
    highlights.invalidate();
  });
  return () => {
    unsubscribe();
    cursor.override(null);
    unregister();
  };
}
