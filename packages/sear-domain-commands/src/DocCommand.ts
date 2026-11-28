import {
  DocNodeRegistry,
  isTextNode,
  segmentTextGraphemes,
  type DocCursorPos,
  type DocSelection,
  type RichDocNode,
} from '@searsuite/sear-domain-doc';
import { type DocLayoutEngine, type LayoutSnapshot } from '@searsuite/sear-domain-editor';
import { type NodeSchema } from '@searsuite/sear-domain-ot';
import { DocTransaction } from './DocTransaction';

/** Runtime state available while a rich-document command builds a transaction. */
export interface DocCommandContext {
  /** Pending document tree used for reads before the transaction is committed. */
  pendingDoc: RichDocNode[];
  /** Editor-local schema definitions used when creating new blocks and text. */
  nodes?: DocNodeRegistry;
  /** Current document selection before the command applies. */
  docSelection: DocSelection;
  /** Preferred horizontal position used by repeated vertical cursor navigation. */
  preferredX: number | null;
  /** Last measured layout snapshot, required for vertical cursor movement. */
  lastSnapshot: LayoutSnapshot | null;
}

/** Rich-document command that appends steps to a transaction. */
export type DocCommand = (tr: DocTransaction, state: DocCommandContext) => DocTransaction;

/** Cardinal directions accepted by rich-document cursor navigation commands. */
export const DocCursorDirection = {
  Up: 'up',
  Down: 'down',
  Left: 'left',
  Right: 'right',
} as const;

/** Union of cursor directions accepted by rich-document navigation. */
export type DocCursorDirection = (typeof DocCursorDirection)[keyof typeof DocCursorDirection];

// ---------------------------------------------------------------------------
// Local helpers — inlined from sear-doc to avoid circular dependency
// (sear-doc → sear-render-node → sear-core → sear-doc cycle)
// ---------------------------------------------------------------------------

/** Compares two document cursor positions in tree order. */
function compareCursor(a: DocCursorPos, b: DocCursorPos): -1 | 0 | 1 {
  const len = Math.max(a.path.length, b.path.length);
  for (let i = 0; i < len; i++) {
    const ai = a.path[i] ?? -Infinity;
    const bi = b.path[i] ?? -Infinity;
    if (ai < bi) return -1;
    if (ai > bi) return 1;
  }
  if (a.offset < b.offset) return -1;
  if (a.offset > b.offset) return 1;
  return 0;
}

/** Returns whether a selection's anchor and head are the same cursor. */
function isCollapsed(sel: DocSelection): boolean {
  return compareCursor(sel.anchor, sel.head) === 0;
}

/** Orders a selection into start/end cursor positions. */
function normalizeSelection(sel: DocSelection): {
  start: DocCursorPos;
  end: DocCursorPos;
} {
  const cmp = compareCursor(sel.anchor, sel.head);
  return cmp <= 0 ? { start: sel.anchor, end: sel.head } : { start: sel.head, end: sel.anchor };
}

/** Replaces a selection spanning text nodes while retaining content after its end. */
function replaceAcrossTextNodes(
  tr: DocTransaction,
  doc: RichDocNode[],
  start: DocCursorPos,
  end: DocCursorPos,
  replacement: string,
): boolean {
  if (start.path.length !== 2 || end.path.length !== 2) return false;
  const [startParagraphIndex, startNodeIndex] = start.path;
  const [endParagraphIndex, endNodeIndex] = end.path;
  const startParagraph = doc[startParagraphIndex];
  const endParagraph = doc[endParagraphIndex];
  const startContent = startParagraph?.content;
  const endContent = endParagraph?.content;
  if (!Array.isArray(startContent) || !Array.isArray(endContent)) return false;
  const startNode = startContent[startNodeIndex];
  const endNode = endContent[endNodeIndex];
  if (!isTextNode(startNode) || !isTextNode(endNode)) return false;

  const trailingNodes: NodeSchema[] = [];
  const endText = resolveTextContent(doc, end.path).slice(end.offset);
  if (endText) trailingNodes.push({ ...endNode, text: endText } as NodeSchema);
  trailingNodes.push(...endContent.slice(endNodeIndex + 1));

  const selectedStartText = resolveTextContent(doc, start.path).slice(start.offset);
  if (selectedStartText) tr.deleteText(start.path, start.offset, selectedStartText);
  for (let index = startContent.length - 1; index > startNodeIndex; index--) {
    tr.deleteNode([startParagraphIndex, index], startContent[index]);
  }
  for (let index = endParagraphIndex; index > startParagraphIndex; index--) {
    tr.deleteNode([index], doc[index]);
  }
  if (replacement) tr.insertText(start.path, start.offset, replacement);
  trailingNodes.forEach((node, index) => {
    tr.insertNode([startParagraphIndex, startNodeIndex + 1 + index], node);
  });
  const cursor = { path: [...start.path], offset: start.offset + replacement.length };
  tr.setSelection({ anchor: cursor, head: cursor });
  return true;
}

/** Resolves the plain text content at a rich-document text-node path. */
function resolveTextContent(doc: RichDocNode[], path: number[]): string {
  let content: readonly RichDocNode[] | undefined = doc;
  let node: RichDocNode | undefined;
  for (const idx of path) {
    node = content?.[idx];
    if (!node) return '';
    content = Array.isArray(node.content) ? node.content : void 0;
  }
  const text = node && typeof node === 'object' ? Reflect.get(node, 'text') : undefined;
  return typeof text === 'string' ? text : '';
}

/** Returns the text length at a rich-document text-node path. */
function getTextNodeLength(doc: RichDocNode[], path: number[]): number {
  return resolveTextContent(doc, path).length;
}

/** Returns the first direct text-node cursor path in a paragraph. */
function getFirstTextPathInParagraph(doc: RichDocNode[], paragraphIndex: number): number[] {
  const paragraph = doc[paragraphIndex];
  const content = paragraph?.content;
  if (!Array.isArray(content)) return [paragraphIndex, 0];
  const textNodeIndex = content.findIndex(isTextNode);
  return [paragraphIndex, textNodeIndex >= 0 ? textNodeIndex : 0];
}

/** Returns the last direct text-node cursor path in a paragraph. */
function getLastTextPathInParagraph(doc: RichDocNode[], paragraphIndex: number): number[] {
  const paragraph = doc[paragraphIndex];
  const content = paragraph?.content;
  if (!Array.isArray(content)) return [paragraphIndex, 0];
  for (let index = content.length - 1; index >= 0; index--) {
    if (isTextNode(content[index])) return [paragraphIndex, index];
  }
  return [paragraphIndex, 0];
}

/** Returns the previous direct text-node cursor path, crossing paragraph boundaries when needed. */
function getPreviousTextPath(doc: RichDocNode[], path: number[]): number[] | null {
  const [paragraphIndex = 0, textNodeIndex = 0] = path;
  const paragraph = doc[paragraphIndex];
  const content = paragraph?.content;
  if (Array.isArray(content)) {
    for (let index = textNodeIndex - 1; index >= 0; index--) {
      if (isTextNode(content[index])) return [paragraphIndex, index];
    }
  }
  if (paragraphIndex <= 0) return null;
  return getLastTextPathInParagraph(doc, paragraphIndex - 1);
}

/** Returns the next direct text-node cursor path, crossing paragraph boundaries when needed. */
function getNextTextPath(doc: RichDocNode[], path: number[]): number[] | null {
  const [paragraphIndex = 0, textNodeIndex = 0] = path;
  const paragraph = doc[paragraphIndex];
  const content = paragraph?.content;
  if (Array.isArray(content)) {
    for (let index = textNodeIndex + 1; index < content.length; index++) {
      if (isTextNode(content[index])) return [paragraphIndex, index];
    }
  }
  if (paragraphIndex >= doc.length - 1) return null;
  return getFirstTextPathInParagraph(doc, paragraphIndex + 1);
}

/**
 * Creates a command that inserts text at the current cursor or replaces a same-node selection.
 * @param text - Text to insert into the rich document.
 * @returns Command that records text OT and collapses the selection after the insert.
 */
export function inputCommand(text: string): DocCommand {
  return function applyTextInputCommand(tr, state) {
    const { docSelection, pendingDoc } = state;
    let insertionPoint = docSelection.head;
    if (!isCollapsed(docSelection)) {
      const { start, end } = normalizeSelection(docSelection);
      const sameNode =
        start.path.length === end.path.length && start.path.every((value, index) => value === end.path[index]);
      if (sameNode) {
        const selectedText = resolveTextContent(pendingDoc, start.path).slice(start.offset, end.offset);
        if (selectedText) tr.deleteText(start.path, start.offset, selectedText);
        insertionPoint = start;
      } else if (replaceAcrossTextNodes(tr, pendingDoc, start, end, text)) {
        return tr;
      }
    }
    tr.insertText(insertionPoint.path, insertionPoint.offset, text);
    const newCursor: DocCursorPos = {
      path: insertionPoint.path,
      offset: insertionPoint.offset + text.length,
    };
    tr.setSelection({ anchor: newCursor, head: newCursor });
    return tr;
  };
}

/**
 * Creates a command for Backspace behavior.
 * @returns Command that deletes a selection, deletes the previous character, or merges with the previous paragraph.
 */
export function deleteBackwardCommand(): DocCommand {
  return function applyDeleteBackwardCommand(tr, state) {
    const { docSelection, pendingDoc } = state;
    const { head } = docSelection;

    if (!isCollapsed(docSelection)) {
      const { start, end } = normalizeSelection(docSelection);
      const sameNode =
        start.path.length === end.path.length && start.path.every((v: number, i: number) => v === end.path[i]);

      if (sameNode) {
        const text = resolveTextContent(pendingDoc, start.path);
        const toDelete = text.slice(start.offset, end.offset);
        if (toDelete.length > 0) {
          tr.deleteText(start.path, start.offset, toDelete);
        }
      } else if (replaceAcrossTextNodes(tr, pendingDoc, start, end, '')) {
        return tr;
      }
      tr.setSelection({ anchor: start, head: start });
      return tr;
    }

    if (head.offset > 0) {
      const text = resolveTextContent(pendingDoc, head.path);
      const range = segmentTextGraphemes(text).find(({ start, end }) => start < head.offset && head.offset <= end);
      if (range) {
        tr.deleteText(head.path, range.start, text.slice(range.start, head.offset));
        const newCursor: DocCursorPos = {
          path: head.path,
          offset: range.start,
        };
        tr.setSelection({ anchor: newCursor, head: newCursor });
      }
      return tr;
    }

    if (head.offset === 0 && head.path[0] > 0) {
      const paraIdx = head.path[0];
      const prevParaIdx = paraIdx - 1;

      const currentText = resolveTextContent(pendingDoc, head.path);
      const prevPath = getLastTextPathInParagraph(pendingDoc, prevParaIdx);
      const prevTextLen = getTextNodeLength(pendingDoc, prevPath);

      if (currentText.length > 0) {
        tr.insertText(prevPath, prevTextLen, currentText);
      }
      tr.deleteNode([paraIdx], {
        type: state.nodes?.requireDefaultBlockType() ?? DocNodeRegistry.requireDefaultBlockType(),
      } as NodeSchema);

      const newCursor: DocCursorPos = {
        path: prevPath,
        offset: prevTextLen,
      };
      tr.setSelection({ anchor: newCursor, head: newCursor });
    }

    return tr;
  };
}

/**
 * Creates a command that splits the current paragraph at the cursor.
 * @returns Command that moves trailing text and nodes into a newly inserted paragraph.
 */
export function splitParagraphCommand(): DocCommand {
  return function applySplitParagraphCommand(tr, state) {
    const { docSelection, pendingDoc } = state;
    const { head } = docSelection;
    const paraIdx = head.path[0];
    const textNodeIdx = head.path[1];
    const text = resolveTextContent(pendingDoc, head.path);
    const para = pendingDoc[paraIdx];

    let after: string;
    let deleteAfterOffset = head.offset;

    if (!isCollapsed(docSelection)) {
      const { start, end } = normalizeSelection(docSelection);
      const sameNode =
        start.path.length === end.path.length && start.path.every((v: number, i: number) => v === end.path[i]);

      if (sameNode) {
        const toDelete = text.slice(start.offset, end.offset);
        if (toDelete.length > 0) {
          tr.deleteText(start.path, start.offset, toDelete);
        }
      }
      after = text.slice(end.offset);
      deleteAfterOffset = start.offset;
    } else {
      after = text.slice(head.offset);
    }

    const nodesAfter: NodeSchema[] = para.content.slice(textNodeIdx + 1).map((n) => JSON.parse(JSON.stringify(n)));

    if (after.length > 0) {
      tr.deleteText(head.path, deleteAfterOffset, after);
    }

    for (let i = nodesAfter.length - 1; i >= 0; i--) {
      tr.deleteNode([paraIdx, textNodeIdx + 1 + i], nodesAfter[i]);
    }

    const newParaContent: NodeSchema[] = [
      {
        type: state.nodes?.requireDefaultTextType() ?? DocNodeRegistry.requireDefaultTextType(),
        text: after,
      } as NodeSchema,
      ...nodesAfter,
    ];
    tr.insertNode([paraIdx + 1], {
      type: state.nodes?.requireDefaultBlockType() ?? DocNodeRegistry.requireDefaultBlockType(),
      content: newParaContent,
    });

    const newCursor: DocCursorPos = { path: [paraIdx + 1, 0], offset: 0 };
    tr.setSelection({ anchor: newCursor, head: newCursor });

    return tr;
  };
}

/**
 * Creates a command that selects the complete rich document.
 * @returns Selection-only command spanning the first text node to the last text node.
 */
export function selectAllCommand(): DocCommand {
  return function applySelectAllCommand(tr, state) {
    const doc = state.pendingDoc;
    if (doc.length === 0) return tr;

    const firstPath = getFirstTextPathInParagraph(doc, 0);
    const anchor: DocCursorPos = { path: firstPath, offset: 0 };
    const lastParaIdx = doc.length - 1;
    const lastPath = getLastTextPathInParagraph(doc, lastParaIdx);
    const lastOffset = getTextNodeLength(doc, lastPath);
    const head: DocCursorPos = { path: lastPath, offset: lastOffset };

    tr.setSelection({ anchor, head });
    tr.setMeta('selectionOnly', true);

    return tr;
  };
}

/**
 * Creates a command for arrow-key cursor movement.
 * @param direction - Navigation direction.
 * @param shiftKey - Whether the movement should extend selection.
 * @param layoutEngine - Layout engine used for vertical line navigation.
 * @returns Selection-only command with the computed cursor or range.
 */
export function moveCursorCommand(
  direction: DocCursorDirection,
  shiftKey: boolean,
  layoutEngine: DocLayoutEngine,
): DocCommand {
  return function applyMoveCursorCommand(tr, state) {
    const newHead = computeArrowMove(direction, state, layoutEngine);
    const newSel: DocSelection = shiftKey
      ? { anchor: state.docSelection.anchor, head: newHead }
      : { anchor: newHead, head: newHead };

    if (direction === DocCursorDirection.Up || direction === DocCursorDirection.Down) {
      const snapshot = state.lastSnapshot;
      if (snapshot && snapshot.lines.length > 0) {
        const cursorPt = layoutEngine.cursorToPoint(state.docSelection.head, snapshot);
        const preferredX = state.preferredX ?? cursorPt.x;
        tr.setMeta('preferredX', preferredX);
      }
    }

    tr.setSelection(newSel);
    tr.setMeta('selectionOnly', true);

    return tr;
  };
}

/** Computes the next cursor position for one arrow-key navigation step. */
function computeArrowMove(
  direction: DocCursorDirection,
  state: DocCommandContext,
  layoutEngine: DocLayoutEngine,
): DocCursorPos {
  const { head } = state.docSelection;
  const doc = state.pendingDoc;

  if (direction === DocCursorDirection.Left) {
    if (head.offset > 0) {
      const range = segmentTextGraphemes(resolveTextContent(doc, head.path)).find(
        ({ start, end }) => start < head.offset && head.offset <= end,
      );
      return { path: head.path, offset: range?.start ?? head.offset - 1 };
    } else if (head.path[0] > 0) {
      const previousPath = getPreviousTextPath(doc, head.path);
      if (previousPath) return { path: previousPath, offset: getTextNodeLength(doc, previousPath) };
    }
    return head;
  }

  if (direction === DocCursorDirection.Right) {
    const textLen = getTextNodeLength(doc, head.path);
    if (head.offset < textLen) {
      const range = segmentTextGraphemes(resolveTextContent(doc, head.path)).find(
        ({ start, end }) => start <= head.offset && head.offset < end,
      );
      return { path: head.path, offset: range?.end ?? head.offset + 1 };
    } else {
      const nextPath = getNextTextPath(doc, head.path);
      if (nextPath) return { path: nextPath, offset: 0 };
    }
    return head;
  }

  const snapshot = state.lastSnapshot;
  if (!snapshot || snapshot.lines.length === 0) {
    return head;
  }

  const cursorPt = layoutEngine.cursorToPoint(head, snapshot);
  const targetX = state.preferredX ?? cursorPt.x;
  const lineIdx = layoutEngine.findLineIndex(head, snapshot);

  if (direction === DocCursorDirection.Up) {
    if (lineIdx <= 0) return head;
    return layoutEngine.pointToCursor(targetX, snapshot.lines[lineIdx - 1].y, snapshot);
  }

  if (lineIdx >= snapshot.lines.length - 1) return head;
  return layoutEngine.pointToCursor(targetX, snapshot.lines[lineIdx + 1].y, snapshot);
}
