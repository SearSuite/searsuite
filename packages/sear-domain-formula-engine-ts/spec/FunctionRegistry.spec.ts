import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { ADD, FunctionRegistry } from '../src/functions';

function fn(name: string): FormulaFunction {
  return { name, evaluate: () => 0 };
}

describe('FunctionRegistry lifecycle', () => {
  it('supports a host catalog without Google-only built-ins while allowing later registration', () => {
    const registry = new FunctionRegistry({ includeGoogleFunctions: false, excludedBuiltinNames: ['REGEXTEST'] });
    expect(registry.has('SUM')).toBe(true);
    expect(registry.has('ADD')).toBe(false);
    expect(registry.has('ARRAY_CONSTRAIN')).toBe(false);
    expect(registry.has('FLATTEN')).toBe(false);
    expect(registry.has('REGEXTEST')).toBe(false);
    const dispose = registry.register(ADD);
    expect(registry.get('ADD')).toEqual(ADD);
    dispose();
    expect(registry.has('ADD')).toBe(false);
  });

  it('restores same-name functions through nested overrides', () => {
    const registry = new FunctionRegistry();
    const baseFunction = fn('CUSTOM');
    const middleFunction = fn('custom');
    const topFunction = fn('CuStOm');
    const base = registry.register(baseFunction);
    const middle = registry.register(middleFunction);
    const top = registry.register(topFunction);

    middle();
    expect(registry.get('CUSTOM')).toEqual(topFunction);
    top();
    expect(registry.get('CUSTOM')).toEqual(baseFunction);
    base();
    expect(registry.has('CUSTOM')).toBe(false);
  });

  it('supports case-insensitive lookup, list, and stale disposer no-op semantics', () => {
    const registry = new FunctionRegistry();
    const first = fn('sum');
    const second = fn('SUM');

    const disposeFirst = registry.register(first);
    expect(registry.get('SuM')).toEqual(first);
    expect(registry.has('sum')).toBe(true);
    expect(registry.list()).toContain('SUM');
    expect(registry.get('count')).toBeDefined();
    expect(registry.list()).toContain('COUNT');

    const disposeSecond = registry.register(second);
    expect(registry.get('sum')).toEqual(second);

    // stale disposer should not remove a newer override
    disposeFirst();
    expect(registry.get('sum')).toEqual(second);

    disposeSecond();
    expect(registry.get('sum')).not.toBe(first);
  });

  it('notifies subscribers for registration and disposal', () => {
    const registry = new FunctionRegistry();
    const changes: string[][] = [];
    const unsubscribe = registry.subscribe((names) => changes.push([...names]));
    const dispose = registry.register(fn('extension'));
    dispose();
    unsubscribe();
    registry.register(fn('ignored'));
    expect(changes).toEqual([['EXTENSION'], ['EXTENSION']]);
  });

  it('registers and disposes a function batch with one notification per operation', () => {
    const registry = new FunctionRegistry();
    const changes: string[][] = [];
    registry.subscribe((names) => changes.push([...names]));
    const first = fn('first_extension');
    const second = fn('SECOND_EXTENSION');
    const secondOverride = fn('second_extension');

    const dispose = registry.registerMany([first, second, secondOverride]);

    expect(registry.get('FIRST_EXTENSION')).toEqual(first);
    expect(registry.get('second_extension')).toEqual(secondOverride);
    expect(changes).toEqual([['FIRST_EXTENSION', 'SECOND_EXTENSION']]);

    dispose();
    dispose();

    expect(registry.has('FIRST_EXTENSION')).toBe(false);
    expect(registry.has('SECOND_EXTENSION')).toBe(false);
    expect(changes).toEqual([
      ['FIRST_EXTENSION', 'SECOND_EXTENSION'],
      ['FIRST_EXTENSION', 'SECOND_EXTENSION'],
    ]);
  });

  it('does not notify for an empty function batch', () => {
    const registry = new FunctionRegistry();
    const changes: string[][] = [];
    registry.subscribe((names) => changes.push([...names]));

    const dispose = registry.registerMany([]);
    dispose();

    expect(changes).toEqual([]);
  });

  it('keeps function behavior and metadata detached from a retained registration', () => {
    const registry = new FunctionRegistry();
    const custom: FormulaFunction = {
      name: 'STABLE_EXTENSION',
      descriptor: {
        version: 1, summary: 'Original', category: 'Test', example: '=STABLE_EXTENSION()',
        parameters: [{ name: 'value', description: 'Original', accepts: ['number'] }],
      },
      evaluate: () => 1,
    };
    registry.register(custom);
    custom.evaluate = () => 2;
    (custom.descriptor!.parameters[0] as { description: string }).description = 'Changed';

    const stored = registry.get('STABLE_EXTENSION')!;
    expect(stored.evaluate([], {} as never)).toBe(1);
    expect(stored.descriptor?.parameters[0]?.description).toBe('Original');
    expect(Object.isFrozen(stored)).toBe(true);
    expect(Object.isFrozen(stored.descriptor?.parameters[0])).toBe(true);
  });

  it('rejects direct registration after binding and delegates disposal to the owner', () => {
    const registry = new FunctionRegistry();
    const dispose = registry.register(fn('bound_extension'));
    let executing = false;
    const dispatched: number[] = [];
    registry.enforceCommandBoundary(() => executing, (id) => dispatched.push(id));
    expect(() => registry.register(fn('direct'))).toThrow('editor.commands.run');
    dispose();
    expect(registry.has('bound_extension')).toBe(true);
    expect(dispatched).toHaveLength(1);
    executing = true;
    registry.unregisterRegistration(dispatched[0]!);
    expect(registry.has('bound_extension')).toBe(false);
  });
});
