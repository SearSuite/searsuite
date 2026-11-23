import { createDocNodeIdFromPath, resolveDocNodeId } from '../src';

describe('DocNodeId', () => {
  it('resolves stable identity only from the top-level node id', () => {
    expect(resolveDocNodeId({ id: 'paragraph-1' }, [0])).toBe('paragraph-1');
    expect(resolveDocNodeId({ id: '   ' }, [0])).toBe(createDocNodeIdFromPath([0]));
    expect(resolveDocNodeId({ attrs: { id: 'legacy-attrs-id' } } as never, [1])).toBe(createDocNodeIdFromPath([1]));
  });
});
