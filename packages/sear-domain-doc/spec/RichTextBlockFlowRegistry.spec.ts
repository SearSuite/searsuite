import {
  DocNodeRegistry,
  ParagraphNode,
  RichTextBlockFlowRegistry,
  createDefaultRichTextBlockFlowContribution,
} from '../src';

function paragraph(attrs: Record<string, unknown> = {}) {
  return DocNodeRegistry.create({ type: ParagraphNode.nodeType, attrs, content: [] });
}

describe('RichTextBlockFlowRegistry', () => {
  it('resolves explicit spacing and omits trailing spacing on the final block', () => {
    const registry = new RichTextBlockFlowRegistry(8);
    registry.register(createDefaultRichTextBlockFlowContribution());
    const nodes = [paragraph({ spacingAfter: 16 }), paragraph()];

    expect(registry.resolve({ node: nodes[0], index: 0, blockCount: nodes.length })).toBe(16);
    expect(registry.resolve({ node: nodes[1], index: 1, blockCount: nodes.length })).toBe(0);
  });

  it('keeps retained callbacks stable and requires command scope to unregister', () => {
    const registry = new RichTextBlockFlowRegistry(8);
    const contribution = { key: 'test.stable', resolve: ({ spacingAfter }: { spacingAfter: number }) => spacingAfter };
    const dispose = registry.register(contribution);
    contribution.key = 'test.changed';
    contribution.resolve = () => 99;
    expect(registry.resolve({ node: paragraph(), index: 0, blockCount: 2 })).toBe(8);
    registry.enforceWriteBoundary(() => { throw new Error('command required'); });
    expect(() => dispose()).toThrow('command required');
  });
});
