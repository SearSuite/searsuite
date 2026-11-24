import { BlockManager, RichTextRunRenderRegistry } from '../src';
import {
  DocNodeRegistry,
  ParagraphNode,
  TextNode,
  RichTextInlineStyleRegistry,
  RichTextLineBoxRegistry,
  registerParagraphDocNode,
  registerTextDocNode,
} from '@searsuite/sear-domain-doc';

beforeAll(function registerBlockManagerSpecDocNodes() {
  const registry = new DocNodeRegistry();
  registerParagraphDocNode(registry);
  registerTextDocNode(registry);
});

function paragraph(text: string, attrs: Record<string, unknown> = {}) {
  return DocNodeRegistry.create({
    type: ParagraphNode.nodeType,
    content: [{ type: TextNode.nodeType, text, attrs } as never],
  });
}

function createManager() {
  const shape = jest.fn(({ text }: { text: string }) => ({
    glyphs: [],
    clusters:
      text === ' '
        ? [{ textStart: 0, textEnd: 1, glyphStart: 0, glyphEnd: 0 }]
        : Array.from(text).map((char, index) => ({
            textStart: index,
            textEnd: index + char.length,
            glyphStart: 0,
            glyphEnd: 0,
          })),
    caretStops: Array.from({ length: text.length + 1 }, (_, index) => ({ textOffset: index, x: index * 10 })),
    width: text.length * 10,
    height: 12,
  }));
  const inlineStyles = new RichTextInlineStyleRegistry();
  inlineStyles.register({
    key: 'test.foregroundColor',
    read(input) {
      const style = input.attrs['textStyle'];
      if (!style || typeof style !== 'object') return void 0;
      const color = (style as Record<string, unknown>)['color'];
      return typeof color === 'string' ? { foregroundColor: color } : void 0;
    },
  });
  const manager = new BlockManager(
    { shape } as never,
    inlineStyles,
    new RichTextRunRenderRegistry(),
    new RichTextLineBoxRegistry(),
    '16px sans-serif',
  );
  return { manager, shape };
}

describe('BlockManager', () => {
  it('measures paragraphs, wraps text, preserves styles, and resets state', () => {
    const { manager, shape } = createManager();
    manager.add(paragraph('ab,', { textStyle: { color: '#f00' } }));
    manager.add(paragraph(''));
    manager.add(DocNodeRegistry.create({ type: ParagraphNode.nodeType, content: [] }));
    manager.add(
      DocNodeRegistry.create({ type: ParagraphNode.nodeType, content: [{ type: TextNode.nodeType }] as never }),
    );
    manager.add(paragraph('invalid-color', { textStyle: { color: 123 } }));
    manager.add(paragraph('b'));
    manager.add(paragraph('undefinedAscent'));

    const lines = manager.calculateLayout(15);
    const perParagraph = manager.calculateLayoutPerParagraph(15);

    expect(manager.maxWidth).toBeGreaterThan(0);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0].chars[0]).toEqual(expect.objectContaining({ char: 'a', style: { foregroundColor: '#f00' } }));
    expect(perParagraph).toHaveLength(7);
    expect(perParagraph[1][0].chars[0]).toEqual(expect.objectContaining({ char: '', width: 0, height: 12 }));
    expect(perParagraph[2][0]).toEqual(expect.objectContaining({ chars: [], width: 0, height: 12, fontAscent: 12 }));
    expect(shape).toHaveBeenCalled();

    manager.clear();
    expect(manager.maxWidth).toBe(0);
    expect(manager.calculateLayout(10)).toEqual([]);
  });

  it('handles empty text node with undefined fontAscent from metrics', () => {
    const { manager, shape } = createManager();
    shape.mockReturnValue({
      glyphs: [],
      clusters: [{ textStart: 0, textEnd: 1, glyphStart: 0, glyphEnd: 0 }],
      caretStops: [
        { textOffset: 0, x: 0 },
        { textOffset: 1, x: 0 },
      ],
      width: 0,
      height: 12,
    });
    manager.add(paragraph(''));
    const perParagraph = manager.calculateLayoutPerParagraph(15);
    expect(perParagraph[0][0].fontAscent).toBe(12);
  });

  it('falls back to the whole string when Intl.Segmenter is unavailable', () => {
    const { manager } = createManager();
    const originalSegmenter = Intl.Segmenter;
    Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: void 0 });

    try {
      manager.add(paragraph('abc'));
      const lines = manager.calculateLayoutPerParagraph(100);
      expect(lines[0][0].chars).toEqual([
        expect.objectContaining({ char: 'a', width: 10 }),
        expect.objectContaining({ char: 'b', width: 10 }),
        expect.objectContaining({ char: 'c', width: 10 }),
      ]);
    } finally {
      Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: originalSegmenter });
    }
  });

  it('falls back to hardcoded defaults when default metric probing returns no chars', () => {
    const { manager, shape } = createManager();
    manager.add(DocNodeRegistry.create({ type: ParagraphNode.nodeType, content: [] }));
    shape.mockReturnValue({ glyphs: [], clusters: [], caretStops: [], width: 0, height: 0 });
    const segmenter = jest.spyOn(Intl.Segmenter.prototype, 'segment').mockReturnValue([] as never);
    let perParagraph;
    try {
      perParagraph = manager.calculateLayoutPerParagraph(10);
    } finally {
      segmenter.mockRestore();
    }
    expect(perParagraph[0][0]).toEqual(
      expect.objectContaining({
        width: 0,
        chars: [],
        height: 14,
        fontAscent: 14,
      }),
    );
  });
});
