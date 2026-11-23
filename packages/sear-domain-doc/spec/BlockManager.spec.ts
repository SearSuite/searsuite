import {
  applyTextAttributeRanges,
  DocNodeRegistry,
  ParagraphNode,
  TextNode,
  registerParagraphDocNode,
  registerTextDocNode,
} from '../src';

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

describe('rich document node utilities', () => {
  it('splits text nodes at style boundaries while retaining semantic document nodes', () => {
    const styled = applyTextAttributeRanges(
      [paragraph('hello'), paragraph('world')],
      [
        { start: 1, end: 4, attrs: { textStyle: { color: 'blue' } } },
        { start: 7, end: 9, attrs: { textStyle: { color: 'green' } } },
      ],
    );
    const first = styled[0].content as Array<{
      text?: string;
      attrs: Record<string, unknown>;
    }>;
    const second = styled[1].content as Array<{
      text?: string;
      attrs: Record<string, unknown>;
    }>;

    expect(first.map((node) => node.text)).toEqual(['h', 'ell', 'o']);
    expect(first[1].attrs['textStyle']).toEqual({ color: 'blue' });
    expect(second.map((node) => node.text)).toEqual(['w', 'or', 'ld']);
    expect(second[1].attrs['textStyle']).toEqual({ color: 'green' });
  });

  it('clones non-text nodes and nodes without text during text style application', () => {
    DocNodeRegistry.register(
      'custom-inline',
      (schema) => ({ type: 'custom-inline', attrs: schema.attrs || {}, content: [] } as never),
    );
    const doc = [
      DocNodeRegistry.create({
        type: ParagraphNode.nodeType,
        content: [
          { type: TextNode.nodeType, text: 'a' } as never,
          { type: 'custom-inline' } as never,
          { type: TextNode.nodeType } as never, // no text property
        ],
      }),
    ];
    const styled = applyTextAttributeRanges(doc, []);
    expect(styled[0].content).toHaveLength(2); // The empty text node is dropped
    expect(styled[0].content[1].type).toBe('custom-inline');
  });

  it('abstract create method throws with an explicit routing hint', () => {
    const { RichDocNode } = require('../src');
    expect(() => RichDocNode.create({})).toThrow(
      'RichDocNode.create is abstract; use DocNodeRegistry.create or a concrete node class.',
    );
  });

  it('DocNodeRegistry instance delegates create', () => {
    const registry = new DocNodeRegistry();
    const node = registry.create({ type: ParagraphNode.nodeType, content: [] });
    expect(node.type).toBe(ParagraphNode.nodeType);
  });

  it('throws on unregistered node type', () => {
    expect(() => DocNodeRegistry.create({ type: 'unknown-type' })).toThrow('Unknown node type: unknown-type');
  });
});
