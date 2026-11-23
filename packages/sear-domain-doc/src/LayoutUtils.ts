/**
 * Compute the Y coordinate of the first text line's baseline for vertical centering.
 *
 * Text painters in this engine position runs by their alphabetic baseline, so the
 * correct formula to visually center a line inside a padded box is:
 *
 *   baseline = center + (fontAscent - fontDescent) / 2
 *
 * Since `lineHeight = fontAscent + fontDescent`, this simplifies to:
 *
 *   baseline = offsetY + cellPadding + (boxHeight - 2·cellPadding + 2·fontAscent - lineHeight) / 2
 *
 * @param boxHeight   Total pixel height of the containing box (e.g. cell height).
 * @param cellPadding Padding on each side of the box.
 * @param fontAscent  Measured font ascent of the first line (stable across all glyphs in the font).
 * @param lineHeight  Total line height (`fontAscent + fontDescent`) of the first line.
 * @param offsetY     Absolute Y offset of the box top-left (default 0 for relative coordinates).
 */
export function computeFirstBaselineY(
  boxHeight: number,
  cellPadding: number,
  fontAscent: number,
  lineHeight: number,
  offsetY: number = 0,
): number {
  return offsetY + cellPadding + (boxHeight - 2 * cellPadding + 2 * fontAscent - lineHeight) / 2;
}
