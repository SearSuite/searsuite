import { TextNode } from './BuiltinDocNodes';
import { DocNodeRegistry } from './DocNodeRegistry';
import { RichDocNode } from './RichDocNode';

// ---------------------------------------------------------------------------
// Cursor position inside a rich-text document (path-based)
// ---------------------------------------------------------------------------

/**
 * Cursor position inside a RichDocNode tree.
 *
 * `path` is an array of integer indices that navigates from the implicit
 * document root (the `RichDocNode[]` array treated as `root.content`) down to
 * the **text node** that contains the cursor.
 *
 * Examples for a flat document:
 *   [0, 0]  → paragraph 0 → text node 0 (the most common case in P0)
 *   [1, 2]  → paragraph 1 → inline span 2
 *
 * The path aligns with OT operation paths: a StringInsert at this cursor
 * becomes `{ p: [...path, offset], si: text }` applied to the root wrapper
 * `{ type: 'doc', content: doc }`.
 *
 * `offset` is the character position within the leaf text node:
 *   0  = before first character
 *   n  = after the nth character (= text.length means "end of node")
 */
export interface DocCursorPos {
  /** Path from root `content[]` to the leaf text node. */
  path: number[];
  /** Character offset within the leaf text node. */
  offset: number;
}

/**
 * Anchor + head selection model.
 * Collapsed selection (cursor only): anchor === head.
 * `head` moves freely; `anchor` is fixed until a non-Shift action resets it.
 */
export interface DocSelection {
  anchor: DocCursorPos;
  head: DocCursorPos;
}

// ---------------------------------------------------------------------------
// Factory interface — allows DI-injected or custom node creators
// ---------------------------------------------------------------------------

/**
 * Minimal factory interface for creating document nodes.
 * Implemented by `DocNodeRegistry` (static or injected).
 */
export interface RichNodeFactory {
  create(schema: {
    id?: string;
    type: string;
    text?: string;
    attrs?: Record<string, unknown>;
    content?: unknown[];
  }): RichDocNode;
}

// ---------------------------------------------------------------------------
// Pure utility functions (no factory / no side-effects)
// ---------------------------------------------------------------------------

/** Runs the is collapsed helper. */
export function isCollapsed(sel: DocSelection): boolean {
  return compareCursor(sel.anchor, sel.head) === 0;
}

/**
 * Lexicographic comparison of two cursor positions.
 * Compares `path` element-by-element, then `offset`. Returns -1 | 0 | 1.
 */
export function compareCursor(a: DocCursorPos, b: DocCursorPos): -1 | 0 | 1 {
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

/** Normalize selection so `start` ≤ `end` regardless of direction. */
export function normalizeSelection(sel: DocSelection): {
  start: DocCursorPos;
  end: DocCursorPos;
} {
  const cmp = compareCursor(sel.anchor, sel.head);
  return cmp <= 0 ? { start: sel.anchor, end: sel.head } : { start: sel.head, end: sel.anchor };
}

// ---------------------------------------------------------------------------
// Document navigation helpers (read-only)
// ---------------------------------------------------------------------------

/**
 * Resolve the text node at `path` inside `doc` (treated as the root content
 * array). Returns `undefined` if the path is invalid.
 */
export function resolveNode(doc: RichDocNode[], path: number[]): RichDocNode | undefined {
  let content: readonly RichDocNode[] | undefined = doc;
  let node: RichDocNode | undefined;
  for (const idx of path) {
    node = content?.[idx];
    if (!node) return void 0;
    content = Array.isArray(node.content) ? node.content : void 0;
  }
  return node;
}

/**
 * Get the plain-text string of the node at `path`.
 * Convenience wrapper around `resolveNode`.
 */
export function resolveTextContent(doc: RichDocNode[], path: number[]): string {
  const node = resolveNode(doc, path);
  if (!node) return '';
  const textNode = node as TextNode;
  return typeof textNode.text === 'string' ? textNode.text : '';
}

/**
 * Character length of the text node at `path`. Returns 0 for missing / non-text nodes.
 */
export function getTextNodeLength(doc: RichDocNode[], path: number[]): number {
  return resolveTextContent(doc, path).length;
}

/**
 * Converts a cursor position into a zero-based offset in the document's plain
 * text, using one newline character between paragraphs.
 */
export function getDocumentOffset(doc: RichDocNode[], position: DocCursorPos): number {
  const [paragraphIndex = 0, textNodeIndex = 0] = position.path;
  let offset = 0;

  for (let index = 0; index < paragraphIndex && index < doc.length; index++) {
    offset += paraTextLength(doc[index]) + 1;
  }

  const paragraph = doc[paragraphIndex];
  if (!paragraph) return offset;
  const textNodes = paragraph.content as TextNode[];
  for (let index = 0; index < textNodeIndex && index < textNodes.length; index++) {
    offset += textNodes[index].text?.length ?? 0;
  }

  return offset + position.offset;
}

/** Total plain-text length of a paragraph node (sums all direct text children). */
export function paraTextLength(para: RichDocNode): number {
  return (para.content as (RichDocNode | TextNode)[]).reduce((sum, n) => {
    if (isTextLeaf(n)) return sum + (typeof n.text === 'string' ? n.text.length : 0);
    return sum;
  }, 0);
}

/** Extract the concatenated plain text of a paragraph node. */
export function paraText(para: RichDocNode): string {
  return (para.content as (RichDocNode | TextNode)[])
    .filter(isTextLeaf)
    .map((n) => n.text ?? '')
    .join('');
}

/** Returns true if every paragraph in `doc` contains no meaningful text. */
export function isDocSemanticallyEmpty(doc: RichDocNode[]): boolean {
  return doc.every((para) => paraTextLength(para) === 0);
}

// ---------------------------------------------------------------------------
// Factory-dependent helpers
// ---------------------------------------------------------------------------

/** Returns the process-wide schema registry used by the current document protocol. */
function registry(): typeof DocNodeRegistry {
  return DocNodeRegistry;
}

/** Create a single empty paragraph containing one empty text node. */
export function createEmptyParagraph(): RichDocNode {
  const r = registry();
  return r.create({
    type: r.requireDefaultBlockType(),
    content: [{ type: r.requireDefaultTextType(), text: '' }],
  });
}

/**
 * Convert a plain string to a single-paragraph RichDocNode[].
 * Used for backward-compat when cell data is still stored as a plain string.
 */
export function stringToRichDoc(text: string): RichDocNode[] {
  const r = registry();
  return [
    r.create({
      type: r.requireDefaultBlockType(),
      content: [{ type: r.requireDefaultTextType(), text }],
    }),
  ];
}

/**
 * Ensure `doc` has at least one paragraph.
 * Returns the same array if already valid; otherwise `[createEmptyParagraph()]`.
 */
export function normalizeDocForEdit(doc: RichDocNode[]): RichDocNode[] {
  return doc.length > 0 ? doc : [createEmptyParagraph()];
}

function isTextLeaf(node: RichDocNode | TextNode): node is TextNode {
  return node && typeof node === 'object' && 'text' in node;
}
