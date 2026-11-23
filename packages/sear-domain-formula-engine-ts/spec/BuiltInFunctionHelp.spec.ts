import { FunctionRegistry } from '../src/functions';

describe('built-in formula help', () => {
  it('provides summaries, examples, and parameter hints for every registered function', () => {
    const registry = new FunctionRegistry();
    expect(registry.list()).toHaveLength(506);
    for (const name of registry.list()) {
      const descriptor = registry.get(name)?.descriptor;
      expect(descriptor?.summary).toBeTruthy();
      expect(descriptor?.example).toMatch(new RegExp(`^=${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\(`));
      expect(descriptor?.parameters).toBeDefined();
    }
    expect(registry.get('SUM')?.descriptor?.parameters).toEqual([
      expect.objectContaining({ name: 'number', repeating: true }),
    ]);
    expect(registry.get('XLOOKUP')?.descriptor?.parameters.map((parameter) => parameter.name)).toEqual([
      'lookup_value',
      'lookup_array',
      'return_array',
      'if_not_found',
      'match_mode',
      'search_mode',
    ]);
  });

  it('keeps a third-party function descriptor supplied by its owner', () => {
    const registry = new FunctionRegistry();
    const descriptor = {
      version: 1 as const,
      category: 'Custom',
      summary: 'Custom help.',
      example: '=SUM(1)',
      parameters: [{ name: 'custom', description: 'Custom parameter.' }],
    };
    const dispose = registry.register({ name: 'SUM', descriptor, evaluate: () => 1 });
    expect(registry.get('SUM')?.descriptor).toEqual(descriptor);
    expect(registry.get('SUM')?.descriptor).not.toBe(descriptor);
    expect(Object.isFrozen(registry.get('SUM')?.descriptor?.parameters)).toBe(true);
    dispose();
    expect(registry.get('SUM')?.descriptor).not.toBe(descriptor);
  });
});
