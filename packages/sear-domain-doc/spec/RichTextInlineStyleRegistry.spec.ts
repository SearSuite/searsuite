import { RichTextInlineStyleRegistry, updateInlineTextStyleAttrs } from '../src';

describe('RichTextInlineStyleRegistry', () => {
  it('resolves plugin-owned inline style mutations by style key', () => {
    const registry = new RichTextInlineStyleRegistry();
    registry.register({
      key: 'text.testStyle',
      mutations: [
        {
          styleKey: 'testStyle',
          apply(input) {
            const nextAttrs = { ...input.attrs };
            const textStyle = updateInlineTextStyleAttrs(input.attrs['textStyle'], 'testStyle', input.value);
            if (Object.keys(textStyle).length > 0) nextAttrs['textStyle'] = textStyle;
            else delete nextAttrs['textStyle'];
            return nextAttrs;
          },
        },
      ],
    });

    expect(registry.getMutation('missing')).toBeUndefined();
    expect(registry.getMutationKeys()).toEqual(['testStyle']);
    expect(registry.requireMutation('testStyle').apply({ attrs: {}, value: 'enabled' })).toEqual({
      textStyle: { testStyle: 'enabled' },
    });
    expect(() => registry.requireMutation('missing')).toThrow(
      'Rich-text inline style mutation "missing" is not registered.',
    );
  });

  it('rejects duplicate mutation style keys across contributions', () => {
    const registry = new RichTextInlineStyleRegistry();
    registry.register({
      key: 'text.first',
      mutations: [{ styleKey: 'sharedStyle', apply: ({ attrs }) => attrs }],
    });

    expect(() =>
      registry.register({
        key: 'text.second',
        mutations: [{ styleKey: 'sharedStyle', apply: ({ attrs }) => attrs }],
      }),
    ).toThrow('Rich-text inline style mutation "sharedStyle" already exists.');
  });

  it('keeps retained contributions stable and requires command scope for registration changes', () => {
    const registry = new RichTextInlineStyleRegistry();
    const mutation = { styleKey: 'stable', apply: ({ attrs }: { attrs: Record<string, unknown> }) => attrs };
    const contribution = { key: 'test.stable', mutations: [mutation] };
    const dispose = registry.register(contribution);
    contribution.key = 'test.changed';
    mutation.styleKey = 'changed';
    mutation.apply = () => ({ changed: true });
    contribution.mutations.push({ styleKey: 'extra', apply: () => ({}) });
    expect(registry.getMutationKeys()).toEqual(['stable']);
    expect(registry.requireMutation('stable').apply({ attrs: {}, value: null })).toEqual({});

    let executing = false;
    registry.enforceWriteBoundary(() => { if (!executing) throw new Error('command required'); });
    expect(() => registry.register({ key: 'test.other' })).toThrow('command required');
    expect(() => dispose()).toThrow('command required');
    executing = true;
    dispose();
    expect(registry.getMutation('stable')).toBeUndefined();
  });
});
