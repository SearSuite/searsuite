import { DocNodeRegistry } from './DocNodeRegistry';
import { compareCursor, normalizeSelection, type DocCursorPos, type DocSelection } from './DocSelection';
import { type RichDocNode } from './RichDocNode';
import { isTextNode } from './RichDocNodeGuards';
import { type NodeSchema } from './RichDocSchema';
import { type TextNode } from './TextNode';

/** Context supplied when patching one selected text-node segment. */
export interface InlineTextRangePatchContext {
  readonly node: TextNode;
  readonly blockIndex: number;
  readonly childIndex: number;
  readonly startOffset: number;
  readonly endOffset: number;
}

/** Patches the attrs for the selected segment of one text node. */
export type InlineTextRangeAttrsPatcher = (
  attrs: Record<string, unknown>,
  context: InlineTextRangePatchContext,
) => Record<string, unknown>;

/** One text-node replacement produced by an inline text range edit. */
export interface InlineTextRangePatch {
  readonly blockIndex: number;
  readonly childIndex: number;
  readonly oldNode: TextNode;
  readonly replacement: readonly RichDocNode[];
  readonly startOffset: number;
  readonly endOffset: number;
  readonly beforeLength: number;
  readonly selectedLength: number;
  readonly replacementCount: number;
  readonly wholeNode: boolean;
}

/** Builds reusable text-node split/replacement patches for a document selection. */
export function buildInlineTextRangePatchPlan(
  doc: readonly RichDocNode[],
  selection: DocSelection,
  patchAttrs: InlineTextRangeAttrsPatcher,
): InlineTextRangePatch[] {
  const { start, end } = normalizeSelection(selection);
  if (compareCursor(start, end) === 0) return [];

  const patches: InlineTextRangePatch[] = [];
  const startBlockIndex = start.path[0] ?? 0;
  const endBlockIndex = end.path[0] ?? 0;
  const startChildIndex = start.path[1] ?? 0;
  const endChildIndex = end.path[1] ?? Number.MAX_SAFE_INTEGER;

  for (let blockIndex = endBlockIndex; blockIndex >= startBlockIndex; blockIndex--) {
    const block = doc[blockIndex];
    const content = block && Array.isArray(block.content) ? block.content : [];
    for (let childIndex = content.length - 1; childIndex >= 0; childIndex--) {
      if (blockIndex === startBlockIndex && childIndex < startChildIndex) continue;
      if (blockIndex === endBlockIndex && childIndex > endChildIndex) continue;
      const child = content[childIndex];
      if (!isTextNode(child)) continue;

      const text = child.text ?? '';
      const startOffset = blockIndex === startBlockIndex && childIndex === startChildIndex ? start.offset : 0;
      const endOffset = blockIndex === endBlockIndex && childIndex === endChildIndex ? end.offset : text.length;
      if (endOffset <= 0 || startOffset >= text.length || startOffset >= endOffset) continue;

      const clampedStart = Math.max(0, startOffset);
      const clampedEnd = Math.min(text.length, endOffset);
      const before = text.slice(0, clampedStart);
      const selected = text.slice(clampedStart, clampedEnd);
      const after = text.slice(clampedEnd);
      const selectedAttrs = patchAttrs(
        { ...child.attrs },
        { node: child, blockIndex, childIndex, startOffset: clampedStart, endOffset: clampedEnd },
      );
      const replacement = [
        before ? createTextNode(before, child.attrs) : null,
        selected ? createTextNode(selected, selectedAttrs) : null,
        after ? createTextNode(after, child.attrs) : null,
      ].filter((node): node is RichDocNode => node !== null);

      patches.push({
        blockIndex,
        childIndex,
        oldNode: child,
        replacement,
        startOffset: clampedStart,
        endOffset: clampedEnd,
        beforeLength: before.length,
        selectedLength: selected.length,
        replacementCount: replacement.length,
        wholeNode: before.length === 0 && after.length === 0,
      });
    }
  }

  return patches;
}

/** Applies an inline text range patch plan to an immutable document snapshot. */
export function applyInlineTextRangePatchPlan(
  doc: readonly RichDocNode[],
  patches: readonly InlineTextRangePatch[],
): RichDocNode[] {
  const patchesByBlock = new Map<number, InlineTextRangePatch[]>();
  for (const patch of patches) {
    const blockPatches = patchesByBlock.get(patch.blockIndex) ?? [];
    blockPatches.push(patch);
    patchesByBlock.set(patch.blockIndex, blockPatches);
  }

  return doc.map(function applyInlineTextRangeBlock(block, blockIndex) {
    const blockPatches = patchesByBlock.get(blockIndex);
    if (!blockPatches || blockPatches.length === 0) return block;

    const nextContent = [...(Array.isArray(block.content) ? block.content : [])];
    for (const patch of blockPatches) {
      nextContent.splice(patch.childIndex, 1, ...patch.replacement);
    }

    const schema: NodeSchema = { type: block.type, attrs: { ...block.attrs }, content: nextContent };
    if (block.id) schema.id = block.id;
    return DocNodeRegistry.create(schema);
  });
}

/** Repositions a cursor after an inline text range patch plan has been applied. */
export function mapInlineTextRangePatchCursor(
  cursor: DocCursorPos,
  patches: readonly InlineTextRangePatch[],
): DocCursorPos {
  const [blockIndex, childIndex] = cursor.path;
  const blockPatches = patches.filter((patch) => patch.blockIndex === blockIndex);
  const own = blockPatches.find((patch) => patch.childIndex === childIndex);
  const precedingShift = blockPatches
    .filter((patch) => patch.childIndex < (childIndex ?? 0))
    .reduce((shift, patch) => shift + patch.replacementCount - 1, 0);
  if (!own) {
    return { path: [blockIndex ?? 0, (childIndex ?? 0) + precedingShift], offset: cursor.offset };
  }

  const baseIndex = own.childIndex + precedingShift;
  if (cursor.offset < own.startOffset && own.beforeLength > 0) {
    return { path: [blockIndex ?? 0, baseIndex], offset: cursor.offset };
  }
  if (cursor.offset <= own.endOffset && own.selectedLength > 0) {
    return {
      path: [blockIndex ?? 0, baseIndex + (own.beforeLength > 0 ? 1 : 0)],
      offset: cursor.offset - own.startOffset,
    };
  }
  return {
    path: [blockIndex ?? 0, baseIndex + (own.beforeLength > 0 ? 1 : 0) + (own.selectedLength > 0 ? 1 : 0)],
    offset: Math.max(0, cursor.offset - own.endOffset),
  };
}

function createTextNode(text: string, attrs: Record<string, unknown>): RichDocNode {
  return DocNodeRegistry.create({
    type: DocNodeRegistry.requireDefaultTextType(),
    text,
    attrs: { ...attrs },
  });
}
