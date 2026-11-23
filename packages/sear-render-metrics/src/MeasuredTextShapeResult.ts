import { segmentTextGraphemes } from '@searsuite/sear-domain-doc';
import { type TextShapeResult } from './TextShaperTypes';

/** Converts complete-run and prefix measurements into neutral caret geometry. */
export function createMeasuredTextShapeResult(
  text: string,
  measured: { width: number; height: number; fontAscent?: number; fontDescent?: number },
  measurePrefix: (end: number) => number,
): TextShapeResult {
  const ranges = segmentTextGraphemes(text);
  const caretStops = [{ textOffset: 0, x: 0 }];
  for (const range of ranges) {
    caretStops.push({ textOffset: range.end,
      x: range.end === text.length ? measured.width : measurePrefix(range.end) });
  }
  return {
    glyphs: [],
    clusters: ranges.map((range) => ({ textStart: range.start, textEnd: range.end, glyphStart: 0, glyphEnd: 0 })),
    caretStops,
    width: measured.width,
    height: measured.height,
    ...(measured.fontAscent !== undefined ? { fontAscent: measured.fontAscent } : {}),
    ...(measured.fontDescent !== undefined ? { fontDescent: measured.fontDescent } : {}),
  };
}
