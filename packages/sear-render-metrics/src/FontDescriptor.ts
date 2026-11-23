/** Structured font values supplied by editor configuration and host contexts. */
export interface FontDescriptorInput {
  readonly fontSize: number;
  readonly fontFamily: string;
}

/** Creates the low-level font descriptor consumed by text shaping and rendering. */
export function createFontDescriptor(input: FontDescriptorInput): string {
  if (!Number.isFinite(input.fontSize) || input.fontSize <= 0) {
    throw new TypeError('Font size must be a positive finite number.');
  }
  const fontFamily = input.fontFamily.trim();
  if (!fontFamily) throw new TypeError('Font family must be a non-empty string.');
  return `${input.fontSize}px ${fontFamily}`;
}
