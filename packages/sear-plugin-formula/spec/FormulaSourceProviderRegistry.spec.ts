import { FormulaSourceProviderRegistry } from '../src/FormulaSourceProviderRegistry';

describe('FormulaSourceProviderRegistry', () => {
  it('keeps the registered callback when the caller changes its provider', () => {
    const registry = new FormulaSourceProviderRegistry();
    const provider = { getFormulaSource: () => '=A1' };
    registry.register({ provider });
    provider.getFormulaSource = () => '=B1';

    expect(registry.getFormulaSource(0, 0)).toBe('=A1');
  });

  it('returns the highest-priority provider source', () => {
    const registry = new FormulaSourceProviderRegistry();

    registry.register({ provider: { getFormulaSource: () => '=A1' } });
    registry.register({ provider: { getFormulaSource: () => '=Sheet2!A1' }, priority: 100 });

    expect(registry.getFormulaSource(0, 0)).toBe('=Sheet2!A1');
  });

  it('falls back after a provider is disposed', () => {
    const registry = new FormulaSourceProviderRegistry();
    registry.register({ provider: { getFormulaSource: () => '=A1' } });
    const dispose = registry.register({ provider: { getFormulaSource: () => '=Sheet2!A1' }, priority: 100 });

    dispose();
    dispose();

    expect(registry.getFormulaSource(0, 0)).toBe('=A1');
  });

  it('continues to lower-priority providers when a provider does not own the cell', () => {
    const registry = new FormulaSourceProviderRegistry();
    registry.register({ provider: { getFormulaSource: () => '=A1' } });
    registry.register({ provider: { getFormulaSource: () => undefined }, priority: 100 });

    expect(registry.getFormulaSource(0, 0)).toBe('=A1');
  });
});
