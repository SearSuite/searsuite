import { RichTextCellCommitStrategy } from '../src/richtext/RichTextCellCommitStrategy';
import {
  DocNodeRegistry,
  ParagraphNode,
  TextNode,
  registerParagraphDocNode,
  registerTextDocNode,
  type RichDocNode,
} from '@searsuite/sear-domain-doc';

beforeAll(function registerRichTextCellCommitStrategySpecDocNodes() {
  const registry = new DocNodeRegistry();
  registerParagraphDocNode(registry);
  registerTextDocNode(registry);
});

describe('RichTextCellCommitStrategy', () => {
  it('returns true for persistent rich text', () => {
    const strategy = new RichTextCellCommitStrategy();

    // node is null or not an object
    expect(
      strategy.matches({ richText: [null] as unknown as RichDocNode[], row: 0, col: 0, plainText: '', previous: null }),
    ).toBe(false);
    expect(
      strategy.matches({
        richText: ['string'] as unknown as RichDocNode[],
        row: 0,
        col: 0,
        plainText: '',
        previous: null,
      }),
    ).toBe(false);

    // node has attrs
    expect(
      strategy.matches({
        richText: [{ type: ParagraphNode.nodeType, attrs: { align: 'center' } }] as unknown as RichDocNode[],
        row: 0,
        col: 0,
        plainText: '',
        previous: null,
      }),
    ).toBe(true);

    // node is not paragraph or text
    expect(
      strategy.matches({
        richText: [{ type: 'image' }] as unknown as RichDocNode[],
        row: 0,
        col: 0,
        plainText: '',
        previous: null,
      }),
    ).toBe(true);

    // text node without attrs
    expect(
      strategy.matches({
        richText: [{ type: TextNode.nodeType, text: 'hello' }] as unknown as RichDocNode[],
        row: 0,
        col: 0,
        plainText: '',
        previous: null,
      }),
    ).toBe(false);

    // paragraph with child that has attrs
    expect(
      strategy.matches({
        richText: [
          { type: ParagraphNode.nodeType, content: [{ type: TextNode.nodeType, attrs: { bold: true }, text: 'bold' }] },
        ] as unknown as RichDocNode[],
        row: 0,
        col: 0,
        plainText: '',
        previous: null,
      }),
    ).toBe(true);
  });

  it('commits rich text without copying separately owned format state', () => {
    const strategy = new RichTextCellCommitStrategy();
    const result = strategy.commit({
      row: 0,
      col: 0,
      plainText: '',
      richText: [{ type: ParagraphNode.nodeType, attrs: { align: 'center' } }] as unknown as RichDocNode[],
      previous: { type: 'number', value: 1 },
      format: { kind: 'number' },
    });
    expect(result).toEqual({
      type: 'richtext',
      value: [{ type: ParagraphNode.nodeType, attrs: { align: 'center' } }],
    });
  });
});
