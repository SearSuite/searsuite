import { FormulaRichResultProviderRegistry } from '../src/FormulaRichResultProviderRegistry';

describe('FormulaRichResultProviderRegistry', () => {
  it('keeps the registered callback when the caller changes its provider', () => {
    const registry = new FormulaRichResultProviderRegistry();
    const provider = { getFormulaRichResult: () => ({ kind: 'hyperlink' as const, target: 'old', label: 'Old' }) };
    registry.register({ provider });
    provider.getFormulaRichResult = () => ({ kind: 'hyperlink' as const, target: 'new', label: 'Old' });

    expect(registry.getFormulaRichResult(0, 0)).toEqual({ kind: 'hyperlink', target: 'old', label: 'Old' });
  });

  it('uses priority and registration order, then disposes one provider', () => {
    const registry = new FormulaRichResultProviderRegistry();
    const low = registry.register({
      provider: { getFormulaRichResult: () => ({ kind: 'hyperlink', target: 'low', label: 'Low' }) },
      priority: 1,
    });
    const high = registry.register({
      provider: { getFormulaRichResult: () => ({ kind: 'hyperlink', target: 'high', label: 'High' }) },
      priority: 2,
    });

    expect(registry.getFormulaRichResult(0, 0)).toEqual({ kind: 'hyperlink', target: 'high', label: 'High' });
    low();
    expect(registry.getFormulaRichResult(0, 0)).toEqual({ kind: 'hyperlink', target: 'high', label: 'High' });
    high();
    expect(registry.getFormulaRichResult(0, 0)).toBeUndefined();
  });

  it('falls through when a higher priority provider has no result', () => {
    const registry = new FormulaRichResultProviderRegistry();
    registry.register({ provider: { getFormulaRichResult: () => undefined }, priority: 10 });
    registry.register({
      provider: { getFormulaRichResult: () => ({ kind: 'image', resource: { assetId: 'a', source: 'u' } }) },
      priority: 1,
    });

    expect(registry.getFormulaRichResult(2, 3)).toEqual({
      kind: 'image',
      resource: { assetId: 'a', source: 'u' },
    });
  });
});
