import { updateInlineTextStyleAttrs } from './InlineTextStyleRange';

/** Applies or removes one persisted inline-text style property. */
export function applyInlineTextStylePropertyMutation(
  attrs: Readonly<Record<string, unknown>>,
  property: string,
  value: unknown | null,
): Record<string, unknown> {
  const nextAttrs = { ...attrs };
  const textStyle = updateInlineTextStyleAttrs(attrs['textStyle'], property, value);
  if (Object.keys(textStyle).length > 0) nextAttrs['textStyle'] = textStyle;
  else delete nextAttrs['textStyle'];
  return nextAttrs;
}
