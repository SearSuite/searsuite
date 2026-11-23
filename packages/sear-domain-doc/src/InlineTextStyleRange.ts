import { compareCursor, type DocSelection } from './DocSelection';
import {
  applyInlineTextRangePatchPlan,
  buildInlineTextRangePatchPlan,
  type InlineTextRangeAttrsPatcher,
} from './InlineTextRangePatchPlan';
import { type RichDocNode } from './RichDocNode';

/** Replaces one inline text-style property on the selected document range. */
export function replaceInlineTextStyle(
  doc: RichDocNode[],
  selection: DocSelection,
  property: string,
  value: unknown | null,
  patchAttrs: InlineTextRangeAttrsPatcher = createInlineTextStyleAttrsPatcher(property, value),
): RichDocNode[] {
  if (compareCursor(selection.anchor, selection.head) === 0) return doc;
  const patches = buildInlineTextRangePatchPlan(doc, selection, patchAttrs);
  return patches.length > 0 ? applyInlineTextRangePatchPlan(doc, patches) : doc;
}

/** Creates the compatibility inline text-style attrs patcher for property/value callers. */
export function createInlineTextStyleAttrsPatcher(
  property: string,
  value: unknown | null,
): InlineTextRangeAttrsPatcher {
  return function patchInlineTextStyleAttrs(attrs): Record<string, unknown> {
    const nextAttrs = { ...attrs };
    const textStyle = updateInlineTextStyleAttrs(attrs['textStyle'], property, value);
    if (Object.keys(textStyle).length > 0) nextAttrs['textStyle'] = textStyle;
    else delete nextAttrs['textStyle'];
    return nextAttrs;
  };
}

/** Updates one entry in a text node's style attrs bag. */
export function updateInlineTextStyleAttrs(
  current: unknown,
  property: string,
  value: unknown | null,
): Record<string, unknown> {
  const next = current && typeof current === 'object' ? { ...(current as Record<string, unknown>) } : {};
  if (value === null || value === void 0) delete next[property];
  else next[property] = value;
  return next;
}
