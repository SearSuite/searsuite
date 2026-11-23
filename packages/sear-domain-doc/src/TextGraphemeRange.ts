/** One grapheme range expressed in UTF-16 source offsets. */
export interface TextGraphemeRange {
  readonly start: number;
  readonly end: number;
}

/** Segments text into grapheme ranges, with a code-point fallback for older hosts. */
export function segmentTextGraphemes(text: string): readonly TextGraphemeRange[] {
  const segmenterConstructor = (
    Intl as typeof Intl & {
      Segmenter?: new (
        locale: string | undefined,
        options: { granularity: 'grapheme' },
      ) => { segment(input: string): Iterable<{ index: number; segment: string }> };
    }
  ).Segmenter;

  if (typeof segmenterConstructor === 'function') {
    const segmenter = new segmenterConstructor(undefined, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(text), ({ index, segment }) => ({
      start: index,
      end: index + segment.length,
    }));
  }

  const ranges: TextGraphemeRange[] = [];
  let offset = 0;
  for (const codePoint of text) {
    const end = offset + codePoint.length;
    ranges.push({ start: offset, end });
    offset = end;
  }
  return ranges;
}
