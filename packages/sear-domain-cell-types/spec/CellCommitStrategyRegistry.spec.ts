import {
  CellCommitStrategyRegistry,
  DefaultStringCellCommitStrategy,
  EmptyCellCommitStrategy,
  FormulaCellCommitStrategy,
  NumberCellCommitStrategy,
  RichTextCellCommitStrategy,
  TextCellCommitStrategy,
} from '../src';
import type { RichDocNode } from '@searsuite/sear-domain-doc';

function createRegistry(): CellCommitStrategyRegistry {
  const registry = new CellCommitStrategyRegistry();
  registry.register(new DefaultStringCellCommitStrategy());
  registry.register(new NumberCellCommitStrategy());
  registry.register(new RichTextCellCommitStrategy());
  registry.register(new TextCellCommitStrategy());
  registry.register(new FormulaCellCommitStrategy());
  registry.register(new EmptyCellCommitStrategy());
  return registry;
}

describe('CellCommitStrategyRegistry', () => {
  it('uses the highest-priority matching strategy while formatting remains separately owned', () => {
    const registry = createRegistry();
    const previous = { type: 'number', value: 1 };

    expect(
      registry.commit({
        row: 0,
        col: 0,
        plainText: '',
        richText: [],
        previous,
        format: { kind: 'text' },
      }),
    ).toBeNull();
    expect(
      registry.commit({
        row: 0,
        col: 0,
        plainText: '=sum(a1:a2)',
        richText: [],
        previous,
        format: { kind: 'text' },
      }),
    ).toEqual({ type: 'string', value: '=sum(a1:a2)' });
    expect(
      registry.commit({
        row: 0,
        col: 0,
        plainText: '=sum(a1:a2)',
        richText: [],
        previous: null,
        format: { kind: 'general' },
      }),
    ).toEqual({ type: 'formula', formula: '=SUM(A1:A2)' });
    expect(
      registry.commit({
        row: 0,
        col: 0,
        plainText: '12.5',
        richText: [],
        previous: null,
      }),
    ).toEqual({ type: 'number', value: 12.5 });
    expect(
      registry.commit({
        row: 0,
        col: 0,
        plainText: "'12.5",
        richText: [],
        previous: null,
      }),
    ).toEqual({ type: 'string', value: '12.5' });
  });

  it('normalizes formula syntax while preserving quoted text and sheet names', () => {
    const registry = createRegistry();
    for (const [plainText, formula] of [
      ['=exact("a","A")', '=EXACT("a","A")'],
      ['="a""b"', '="a""b"'],
      ["='Sheet1'!a1", "='Sheet1'!A1"],
      ["='O''Brien'!a1", "='O''Brien'!A1"],
      ['=Sheet2!a1+sum(Sheet2!b1)', '=Sheet2!A1+SUM(Sheet2!B1)'],
    ]) {
      expect(registry.commit({ row: 0, col: 0, plainText, richText: [], previous: null }))
        .toEqual({ type: 'formula', formula });
    }
  });

  it('persists rich-document semantics and restores replaced registrations', () => {
    const registry = createRegistry();
    const document = [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: '' }],
        attrs: { alignment: 'center' },
      } as unknown as RichDocNode,
    ];
    const committed = registry.commit({
      row: 0,
      col: 0,
      plainText: '',
      richText: document,
      previous: null,
    });
    expect(committed).toEqual({ type: 'richtext', value: document });
    expect(committed).not.toBeNull();
    if (committed !== null && 'value' in committed) {
      expect(committed.value).not.toBe(document);
    }

    const original = registry.get('fallback-string');
    const replacement = {
      key: 'fallback-string',
      priority: 200,
      matches: () => true,
      commit: () => ({ type: 'string' as const, value: 'replacement' }),
    };
    const dispose = registry.register(replacement);
    expect(
      registry.commit({
        row: 0,
        col: 0,
        plainText: 'value',
        richText: [],
        previous: null,
      }),
    ).toEqual({ type: 'string', value: 'replacement' });
    dispose();
    expect(registry.get('fallback-string')).toBe(original);
  });

  it('can register new strategies and dispose them when there is no previous strategy', () => {
    const registry = new CellCommitStrategyRegistry();
    const strategy = {
      key: 'new-strategy',
      priority: 100,
      matches: () => true,
      commit: () => ({ type: 'string' as const, value: 'test' }),
    };
    const dispose = registry.register(strategy);
    expect(registry.get('new-strategy')).toMatchObject({ key: 'new-strategy', priority: 100 });
    expect(registry.get('new-strategy')).not.toBe(strategy);
    dispose();
    expect(registry.get('new-strategy')).toBeUndefined();

    // Testing dispose again shouldn't do anything because the strategy is already gone.
    dispose();
  });

  it('can unregister strategies', () => {
    const registry = new CellCommitStrategyRegistry();
    registry.register({
      key: 'test',
      priority: 100,
      matches: () => true,
      commit: () => ({ type: 'string' as const, value: 'test' }),
    });
    expect(registry.unregister('test')).toBe(true);
    expect(registry.unregister('non-existent')).toBe(false);
  });

  it('can get all strategies', () => {
    const registry = new CellCommitStrategyRegistry();
    const strategy1 = { key: '1', priority: 1, matches: () => true, commit: () => null };
    const strategy2 = { key: '2', priority: 2, matches: () => true, commit: () => null };
    registry.register(strategy1);
    registry.register(strategy2);
    expect(registry.getAll().map((strategy) => strategy.key)).toEqual(['1', '2']);
  });

  it('keeps a retained strategy from changing committed cell behavior', () => {
    const registry = new CellCommitStrategyRegistry();
    const strategy = {
      key: 'custom',
      priority: 10,
      matches: () => true,
      commit: () => ({ type: 'string' as const, value: 'original' }),
    };
    registry.register(strategy);
    strategy.key = 'changed';
    strategy.priority = 1000;
    strategy.commit = () => ({ type: 'string' as const, value: 'replacement' });

    expect(registry.commit({ row: 0, col: 0, plainText: '', richText: [], previous: null }))
      .toEqual({ type: 'string', value: 'original' });
    expect(() => { (registry.get('custom') as { key: string }).key = 'changed'; }).toThrow();
  });

  it('throws SearError when no strategy matches', () => {
    const registry = new CellCommitStrategyRegistry();
    expect(() =>
      registry.commit({
        row: 0,
        col: 0,
        plainText: '',
        richText: [],
        previous: null,
      }),
    ).toThrow('No cell commit strategy matched the editor input.');
  });
});
