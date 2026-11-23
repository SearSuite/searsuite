/** Reads the inline text-style attribute bag from a node's attributes. */
export function readTextStyleAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  const style = attrs['textStyle'];
  return style && typeof style === 'object' ? (style as Record<string, unknown>) : {};
}
