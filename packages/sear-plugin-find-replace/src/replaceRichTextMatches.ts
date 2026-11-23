import { type CellMatrixElement } from '@searsuite/sear-domain-cell-types';
import { type NodeSchema } from '@searsuite/sear-domain-doc-schema';
import { SheetFindReplaceError, SheetFindReplaceErrorCode } from './SheetFindReplaceError';
import { type SheetFindMatch } from './FindReplaceTypes';

interface TextLeaf {
  readonly node: NodeSchema & { text: string };
  readonly block: number;
  readonly start: number;
  readonly end: number;
}

interface TextEdit {
  readonly start: number;
  readonly end: number;
  readonly replacement: string;
}

/** Replaces rich text while retaining node identities and inline attributes. */
export function replaceRichTextMatches(
  previous: CellMatrixElement,
  matches: readonly SheetFindMatch[],
  replacement: string,
): CellMatrixElement {
  if (!Array.isArray(previous.value)) {
    throw new SheetFindReplaceError(SheetFindReplaceErrorCode.InvalidRichText,
      'Rich-text cell has no document content.', { cellType: previous.type });
  }
  const blocks = JSON.parse(JSON.stringify(previous.value)) as NodeSchema[];
  const leaves: TextLeaf[] = [];
  let position = 0;
  blocks.forEach((block, blockIndex) => {
    if (blockIndex > 0) position += 1;
    const collect = (node: NodeSchema): void => {
      if ('text' in node && typeof node.text === 'string') {
        leaves.push({ node: node as NodeSchema & { text: string }, block: blockIndex,
          start: position, end: position + node.text.length });
        position += node.text.length;
      } else {
        node.content?.forEach(collect);
      }
    };
    collect(block);
  });
  const edits = new Map<number, TextEdit[]>();
  const addEdit = (index: number, start: number, end: number, text: string): void => {
    const group = edits.get(index) ?? [];
    group.push({ start, end, replacement: text });
    edits.set(index, group);
  };
  for (const match of matches) {
    const first = findLeaf(leaves, match.start);
    const last = findLeaf(leaves, match.end - 1);
    if (first < 0 || last < 0 || leaves[first].block !== leaves[last].block) {
      throw new SheetFindReplaceError(SheetFindReplaceErrorCode.CrossBlockReplacement,
        'Replacing text across rich-text blocks is unsupported.', { match });
    }
    const head = leaves[first];
    const tail = leaves[last];
    if (first === last) {
      addEdit(first, match.start - head.start, match.end - head.start, replacement);
    } else {
      addEdit(first, match.start - head.start, head.node.text.length, replacement);
      for (let index = first + 1; index < last; index += 1) addEdit(index, 0, leaves[index].node.text.length, '');
      addEdit(last, 0, match.end - tail.start, '');
    }
  }
  edits.forEach((group, index) => {
    const leaf = leaves[index];
    const original = leaf.node.text;
    const parts: string[] = [];
    let cursor = 0;
    for (const edit of group.sort((left, right) => left.start - right.start)) {
      parts.push(original.slice(cursor, edit.start), edit.replacement);
      cursor = edit.end;
    }
    parts.push(original.slice(cursor));
    leaf.node.text = parts.join('');
  });
  return { ...previous, value: blocks };
}

function findLeaf(leaves: readonly TextLeaf[], position: number): number {
  let low = 0;
  let high = leaves.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (leaves[middle].end <= position) low = middle + 1;
    else high = middle;
  }
  return low < leaves.length && leaves[low].start <= position ? low : -1;
}
