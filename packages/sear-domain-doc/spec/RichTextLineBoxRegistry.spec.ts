import {
  RichTextLineBoxRegistry,
  type RichTextLineBoxContribution,
  createDefaultRichTextLineBoxContribution,
  createRichTextLineSpacingContribution,
} from '../src';

describe('RichTextLineBoxRegistry', () => {
  it('resolves the default line box from measured rich-text chars', () => {
    const registry = new RichTextLineBoxRegistry();
    registry.register(createDefaultRichTextLineBoxContribution());

    const lineBox = registry.resolve({
      chars: [
        { char: 'a', width: 5, height: 10, fontAscent: 8, fontDescent: 2 },
        { char: 'B', width: 8, height: 36, fontAscent: 28, fontDescent: 8, fontLineGap: 3 },
      ],
    });

    expect(lineBox).toEqual(
      expect.objectContaining({ ascent: 28, descent: 8, lineGap: 3, contentHeight: 36, leadingTop: 0 }),
    );
    expect(lineBox.lineHeight).toBe(39);
    expect(lineBox.leadingBottom).toBe(3);
  });

  it('lets plugins refine the accumulated line box', () => {
    const registry = new RichTextLineBoxRegistry();
    registry.register({
      key: 'test.extraLeading',
      resolve(input) {
        return {
          ...input.lineBox,
          lineHeight: input.lineBox.lineHeight + 4,
          leadingBottom: input.lineBox.leadingBottom + 4,
        };
      },
    });

    expect(
      registry.resolve({
        chars: [{ char: 'a', width: 5, height: 10, fontAscent: 8, fontDescent: 2 }],
      }).lineHeight,
    ).toBe(14);
  });

  it('resolves multiple line spacing into symmetric leading', () => {
    const registry = new RichTextLineBoxRegistry();
    registry.register(createRichTextLineSpacingContribution());

    const lineBox = registry.resolve({
      chars: [{ char: 'a', width: 5, height: 10, fontAscent: 8, fontDescent: 2 }],
      lineSpacing: { mode: 'multiple', value: 1.5 },
    });

    expect(lineBox).toEqual(
      expect.objectContaining({ contentHeight: 10, lineHeight: 15, leadingTop: 2, leadingBottom: 3 }),
    );
  });

  it('preserves an explicit exact line height even when content overflows it', () => {
    const registry = new RichTextLineBoxRegistry();
    registry.register(createRichTextLineSpacingContribution());

    const lineBox = registry.resolve({
      chars: [{ char: 'A', width: 5, height: 20, fontAscent: 12, fontDescent: 8 }],
      lineSpacing: { mode: 'exact', value: 10 },
    });

    expect(lineBox.lineHeight).toBe(10);
    expect(lineBox.lineGap).toBe(0);
  });

  it('rejects duplicate contribution keys', () => {
    const registry = new RichTextLineBoxRegistry();
    registry.register({ key: 'test.lineBox', resolve: (input) => input.lineBox });

    expect(() => registry.register({ key: 'test.lineBox', resolve: (input) => input.lineBox })).toThrow(
      'Rich-text line box contribution "test.lineBox" already exists.',
    );
  });

  it('keeps retained callbacks stable and requires command scope to unregister', () => {
    const registry = new RichTextLineBoxRegistry();
    const contribution: { key: string; resolve: RichTextLineBoxContribution['resolve'] } = {
      key: 'test.stable', resolve: (input) => input.lineBox,
    };
    const dispose = registry.register(contribution);
    contribution.key = 'test.changed';
    contribution.resolve = (input) => ({ ...input.lineBox, lineHeight: 99 });
    const input = { chars: [{ char: 'a', width: 5, height: 10, fontAscent: 8, fontDescent: 2 }] };
    expect(registry.resolve(input).lineHeight).toBe(10);
    registry.enforceWriteBoundary(() => { throw new Error('command required'); });
    expect(() => dispose()).toThrow('command required');
  });
});
