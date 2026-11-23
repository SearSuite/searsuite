import {
  compareCursor,
  getDocumentOffset,
  getTextNodeLength,
  isCollapsed,
  isDocSemanticallyEmpty,
  normalizeSelection,
  paraText,
  paraTextLength,
  resolveNode,
  resolveTextContent,
  createEmptyParagraph,
  stringToRichDoc,
  normalizeDocForEdit,
  type RichDocNode,
} from '../src';

function documentWithText(...paragraphs: string[]): RichDocNode[] {
  return paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] } as RichDocNode));
}

describe('document selection utilities', () => {
  it('compares, normalizes and identifies collapsed path-based selections', () => {
    const start = { path: [0, 0], offset: 1 };
    const end = { path: [1, 0], offset: 0 };

    expect(compareCursor(start, end)).toBe(-1);
    expect(compareCursor(end, start)).toBe(1);
    expect(compareCursor(start, start)).toBe(0);

    // Different lengths
    expect(compareCursor({ path: [0], offset: 0 }, { path: [0, 0], offset: 0 })).toBe(-1);
    expect(compareCursor({ path: [0, 0], offset: 0 }, { path: [0], offset: 0 })).toBe(1);

    // Same path, different offset
    const start2 = { path: [0, 0], offset: 2 };
    expect(compareCursor(start, start2)).toBe(-1);
    expect(compareCursor(start2, start)).toBe(1);

    expect(isCollapsed({ anchor: start, head: start })).toBe(true);
    expect(isCollapsed({ anchor: start, head: end })).toBe(false);
    expect(normalizeSelection({ anchor: end, head: start })).toEqual({
      start,
      end,
    });
    expect(normalizeSelection({ anchor: start, head: end })).toEqual({
      start,
      end,
    });
  });

  it('resolves text and document offsets across paragraphs', () => {
    const doc = documentWithText('One', 'Two', '');

    expect(resolveTextContent(doc, [1, 0])).toBe('Two');
    expect(getTextNodeLength(doc, [1, 0])).toBe(3);
    expect(getDocumentOffset(doc, { path: [1, 0], offset: 2 })).toBe(6);
    expect(paraText(doc[0]!)).toBe('One');
  });

  it('recognizes semantically empty paragraphs', () => {
    expect(isDocSemanticallyEmpty(documentWithText('', ''))).toBe(true);
    expect(isDocSemanticallyEmpty(documentWithText('', 'content'))).toBe(false);
  });

  it('handles invalid paths, non-text nodes, multi-node paragraph offsets, and omitted cursor path parts', () => {
    const doc = [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'A' },
          { type: 'text', text: 'BC' },
          { type: 'inline', content: [] },
        ],
      } as unknown as RichDocNode,
    ];

    expect(resolveNode(doc, [0])).toBe(doc[0]);
    expect(resolveNode(doc, [1, 0])).toBeUndefined();
    expect(resolveNode([{ type: 'test' } as unknown as RichDocNode], [0, 0])).toBeUndefined();
    expect(resolveTextContent(doc, [0])).toBe('');
    expect(getTextNodeLength(doc, [9, 0])).toBe(0);
    expect(paraTextLength(doc[0]!)).toBe(3);
    expect(paraText(doc[0]!)).toBe('ABC');
    expect(getDocumentOffset(doc, { path: [0, 1], offset: 1 })).toBe(2);
    expect(getDocumentOffset(doc, { path: [4, 0], offset: 2 })).toBe(4);
    expect(getDocumentOffset(doc, { path: [], offset: 1 })).toBe(1);
    expect(getDocumentOffset(doc, { path: [9, 0], offset: 1 })).toBe(4); // out of bounds paragraph
    expect(getDocumentOffset(doc, { path: [0, 9], offset: 1 })).toBe(4); // out of bounds text node

    // Add missing text property test for coverage
    const missingTextDoc = [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: undefined }, // has text property but undefined
          { type: 'custom' }, // custom node
        ],
      } as unknown as RichDocNode,
    ];
    expect(paraTextLength(missingTextDoc[0]!)).toBe(0);
    expect(paraText(missingTextDoc[0]!)).toBe('');
  });

  describe('factory methods', () => {
    it('creates empty paragraph', () => {
      const p = createEmptyParagraph();
      expect(p.type).toBe('paragraph');
      expect(p.content).toHaveLength(1);
      expect((p.content[0] as any).text).toBe('');
    });

    it('converts string to rich doc', () => {
      const doc = stringToRichDoc('hello');
      expect(doc).toHaveLength(1);
      expect(doc[0].type).toBe('paragraph');
      expect(doc[0].content).toHaveLength(1);
      expect((doc[0].content[0] as any).text).toBe('hello');
    });

    it('normalizes doc for edit', () => {
      const emptyDoc: RichDocNode[] = [];
      const normalized = normalizeDocForEdit(emptyDoc);
      expect(normalized).toHaveLength(1);
      expect(normalized[0].type).toBe('paragraph');

      const existingDoc = documentWithText('hello');
      expect(normalizeDocForEdit(existingDoc)).toBe(existingDoc);
    });
  });
});
