import { DocNodeRegistry, DocNodeRole, RichDocNode, type Schema } from '../src';

class CustomNode extends RichDocNode {
  public constructor(schema: Schema) {
    super(schema.type);
    this.initialize(schema);
  }
}

it('keeps custom factories, roles and defaults local to one document runtime', () => {
  const first = new DocNodeRegistry(),
    second = new DocNodeRegistry();
  first.register({
    type: 'custom',
    role: DocNodeRole.Block,
    defaultBlock: true,
    create: (schema) => new CustomNode(schema),
  });
  expect(first.requireDefaultBlockType()).toBe('custom');
  expect(second.requireDefaultBlockType()).toBe('paragraph');
  expect(first.isBlockType('custom')).toBe(true);
  expect(second.isBlockType('custom')).toBe(false);
  expect(() => second.create({ type: 'custom' })).toThrow('Unknown node type');
  expect(() => DocNodeRegistry.create({ type: 'custom' })).toThrow('Unknown node type');
  expect(first.create({ type: 'paragraph', content: [{ type: 'custom' }] }).content[0].type).toBe('custom');
});

it('uses independent factories for the same persisted type', () => {
  const first = new DocNodeRegistry(),
    second = new DocNodeRegistry();
  first.register({ type: 'paragraph', create: (schema) => new CustomNode({ ...schema, attrs: { owner: 'first' } }) });
  expect(first.create({ type: 'paragraph' }).attrs['owner']).toBe('first');
  expect(second.create({ type: 'paragraph' }).attrs['owner']).toBeUndefined();
});
