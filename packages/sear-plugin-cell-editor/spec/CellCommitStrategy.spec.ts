import {
  CellCommitStrategy,
  CellCommitStrategyRegistry,
  type CellCommitContext,
  type CellCommitStrategyDefinition,
} from '@searsuite/sear-domain-cell-types';
import {
  DefaultStringCellCommitStrategy,
  EmptyCellCommitStrategy,
  FormulaCellCommitStrategy,
  NumberCellCommitStrategy,
  RichTextCellCommitStrategy,
  TextCellCommitStrategy,
  CellFormats,
} from '@searsuite/sear-domain-cell-types';

function createContext(plainText: string): CellCommitContext {
  return {
    row: 0,
    col: 0,
    plainText,
    richText: [],
    previous: null,
  };
}

function createRegistry(): CellCommitStrategyRegistry {
  const registry = new CellCommitStrategyRegistry();
  [
    new EmptyCellCommitStrategy(),
    new TextCellCommitStrategy(),
    new DefaultStringCellCommitStrategy(),
    new NumberCellCommitStrategy(),
    new FormulaCellCommitStrategy(),
    new RichTextCellCommitStrategy(),
  ].forEach((strategy) => registry.register(strategy));
  return registry;
}

describe('CellCommitStrategyRegistry', () => {
  it('classifies empty, formulas, numbers, and plain text', () => {
    const registry = createRegistry();

    expect(registry.commit(createContext(''))).toBeNull();
    expect(registry.commit(createContext('=sum(a1:b2)+foo'))).toEqual({
      type: 'formula',
      formula: '=SUM(A1:B2)+FOO',
    });
    expect(registry.commit(createContext('hello'))).toEqual({
      type: 'string',
      value: 'hello',
    });
    expect(registry.commit(createContext('123.45'))).toEqual({
      type: 'number',
      value: 123.45,
    });
    expect(registry.commit(createContext("'00123"))).toEqual({
      type: 'string',
      value: '00123',
    });
  });

  it('persists character-styled content as rich text and preserves text formatting', () => {
    const registry = createRegistry();
    const richText = [
      {
        type: 'paragraph',
        attrs: {},
        content: [
          {
            type: 'text',
            text: 'red',
            attrs: { textStyle: { color: '#f00' } },
            content: [],
          },
        ],
      },
    ] as unknown as CellCommitContext['richText'];

    expect(registry.commit({ ...createContext('red'), richText })).toEqual({
      type: 'richtext',
      value: richText,
    });
    expect(
      registry.commit({
        ...createContext('00123'),
        previous: { type: 'string', value: '00123' },
        format: CellFormats.text,
      }),
    ).toEqual({
      type: 'string',
      value: '00123',
    });
  });

  it('uses format for input interpretation without changing the display-only raw-value contract', () => {
    const registry = createRegistry();

    expect(
      registry.commit({
        ...createContext('00123'),
        previous: { type: 'string', value: '' },
        format: CellFormats.text,
      }),
    ).toEqual({
      type: 'string',
      value: '00123',
    });
    expect(
      registry.commit({
        ...createContext('12%'),
        previous: { type: 'number', value: 0 },
        format: CellFormats.percent,
      }),
    ).toEqual({
      type: 'number',
      value: 0.12,
    });
    expect(
      registry.commit({
        ...createContext('$12.50'),
        previous: { type: 'number', value: 0 },
        format: CellFormats.currency('USD', 'en-US'),
      }),
    ).toEqual({
      type: 'number',
      value: 12.5,
    });
  });

  it('accepts unstyled RichText leaf nodes without assuming they have content', () => {
    const registry = createRegistry();
    const richText = [
      {
        type: 'paragraph',
        attrs: {},
        content: [{ type: 'text', text: 'plain', attrs: {} }],
      },
    ] as unknown as CellCommitContext['richText'];

    // Plain rich text is intentionally committed as the simpler string cell;
    // importantly, a text leaf has no `content` array and must not throw.
    expect(registry.commit({ ...createContext('plain'), richText })).toEqual({
      type: 'string',
      value: 'plain',
    });
  });

  it('allows external strategies to extend commit behavior', () => {
    const registry = createRegistry();

    class PhoneCommitStrategy extends CellCommitStrategy {
      readonly key = 'phone';
      readonly priority = 50;

      matches(context: CellCommitContext): boolean {
        return /^\d{11}$/.test(context.plainText);
      }

      commit(context: CellCommitContext) {
        return { type: 'phone', value: context.plainText };
      }
    }

    const dispose = registry.register(new PhoneCommitStrategy());

    expect(registry.commit(createContext('13800138000'))).toEqual({
      type: 'phone',
      value: '13800138000',
    });
    dispose();
    expect(registry.commit(createContext('13800138000'))).toEqual({
      type: 'number',
      value: 13800138000,
    });
  });

  it('restores same-key strategies only when the active registration is released', () => {
    const registry = new CellCommitStrategyRegistry();
    const strategy = (value: string): CellCommitStrategyDefinition => ({
      key: 'same',
      priority: 1,
      matches: () => true,
      commit: () => ({ type: 'string', value }),
    });
    const base = registry.register(strategy('base'));
    const middle = registry.register(strategy('middle'));
    const top = registry.register(strategy('top'));

    middle();
    expect(registry.commit(createContext('x'))).toEqual({
      type: 'string',
      value: 'top',
    });
    top();
    expect(registry.commit(createContext('x'))).toEqual({
      type: 'string',
      value: 'middle',
    });
    middle();
    expect(registry.commit(createContext('x'))).toEqual({
      type: 'string',
      value: 'base',
    });
    base();
    expect(registry.get('same')).toBeUndefined();
  });

  it('registers plain strategy definitions and can unregister them by key', () => {
    const registry = createRegistry();
    const dateStrategy: CellCommitStrategyDefinition = {
      key: 'date',
      priority: 50,
      matches: (context) => /^\d{4}-\d{2}-\d{2}$/.test(context.plainText),
      commit: (context) => ({ type: 'date', value: context.plainText }),
    };

    registry.register(dateStrategy);
    expect(registry.get('date')).toMatchObject({ key: 'date', priority: 50 });
    expect(registry.get('date')).not.toBe(dateStrategy);
    expect(registry.commit(createContext('2026-07-24'))).toEqual({
      type: 'date',
      value: '2026-07-24',
    });
    expect(registry.unregister('date')).toBe(true);
    expect(registry.get('date')).toBeUndefined();
  });
});
