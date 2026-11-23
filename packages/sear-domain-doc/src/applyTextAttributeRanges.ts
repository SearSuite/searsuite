import { DocNodeRegistry } from './DocNodeRegistry';
import { isTextNode } from './RichDocNodeGuards';
import { type RichDocNode } from './RichDocNode';
import { type NodeSchema, type Schema, type TextSchema } from './RichDocSchema';

/** Attributes merged into a text node for one presentation range. */
export type TextAttributePatch = Readonly<Record<string, unknown>>;

/** A generic text attribute range in document-relative character offsets. */
export interface TextAttributeRange<TAttributes extends TextAttributePatch = TextAttributePatch> {
  start: number;
  end: number;
  attrs: TAttributes;
}

/**
 * Applies presentation attributes to text ranges without owning their meaning.
 * Plugins decide how to interpret the resulting text-node attrs.
 */
export function applyTextAttributeRanges(
  doc: RichDocNode[],
  ranges: readonly TextAttributeRange[],
): RichDocNode[] {
  let documentOffset = 0;

  return doc.map(function applyTextAttributeParagraph(paragraph) {
    const content = (paragraph.content as RichDocNode[]).flatMap(function applyTextAttributeNode(node) {
      if (!isTextNode(node)) return [cloneNode(node)];

      const text = node.text ?? '';
      const textStart = documentOffset;
      const textEnd = textStart + text.length;
      documentOffset = textEnd;
      const boundaries = new Set([0, text.length]);

      ranges.forEach(function collectTextAttributeRangeBoundary(range) {
        if (range.end <= textStart || range.start >= textEnd) return;
        boundaries.add(Math.max(0, range.start - textStart));
        boundaries.add(Math.min(text.length, range.end - textStart));
      });

      const points = [...boundaries].sort(compareNumericPoint);
      const preserveTextNodeId = points.length === 2;
      return points.slice(0, -1).map(function createTextAttributeSlice(start, index) {
        const end = points[index + 1];
        const activeRange = ranges.find(function findActiveTextAttributeRange(range) {
          return range.start <= textStart + start && range.end >= textStart + end;
        });
        const schema: TextSchema = {
          type: DocNodeRegistry.requireDefaultTextType(),
          text: text.slice(start, end),
          attrs: activeRange ? mergeTextNodeAttrs(node.attrs, activeRange.attrs) : { ...node.attrs },
        };
        if (preserveTextNodeId && node.id) schema.id = node.id;
        return DocNodeRegistry.create(schema);
      });
    });

    documentOffset++;
    const schema: NodeSchema = {
      type: paragraph.type,
      attrs: { ...paragraph.attrs },
      content: content as Schema[],
    };
    if (paragraph.id) schema.id = paragraph.id;
    return DocNodeRegistry.create(schema);
  });
}

function mergeTextNodeAttrs(
  attrs: Record<string, unknown>,
  patch: TextAttributePatch,
): Record<string, unknown> {
  return {
    ...attrs,
    ...patch,
  };
}

function cloneNode(node: RichDocNode): RichDocNode {
  const schema: NodeSchema = {
    type: node.type,
    attrs: { ...node.attrs },
    content: (node.content as RichDocNode[]).map(cloneNode) as Schema[],
  };
  if (node.id) schema.id = node.id;
  return DocNodeRegistry.create(schema);
}

function compareNumericPoint(left: number, right: number): number {
  return left - right;
}
