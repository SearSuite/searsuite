import { SearError } from '@searsuite/sear-foundation-error';
import { type Platform } from '@searsuite/sear-foundation-platform';
import { FormulaCellTypeDefinition } from '../src/BuiltinCellDefinitions';
import { CellDisplayTextRegistry } from '../src/CellDisplayTextRegistry';

function createPlatform(): Platform {
  return { warn: jest.fn() } as unknown as Platform;
}

describe('CellDisplayTextRegistry', () => {
  it('keeps a retained provider object from changing registered display behavior', () => {
    const registry = new CellDisplayTextRegistry(createPlatform());
    const provider = { cellType: 'custom', getDisplayText: () => 'original' };
    const dispose = registry.register(provider);
    Object.assign(provider, { cellType: 'forged', getDisplayText: () => 'forged' });

    expect(registry.getDisplayText({ type: 'custom' }, {})).toBe('original');
    dispose();
    expect(registry.getDisplayText({ type: 'custom', value: 'fallback' }, {})).toBe('fallback');
  });

  it('returns formula display text without creating a render Cell', () => {
    const registry = new CellDisplayTextRegistry(createPlatform());
    const providerDefinition = new FormulaCellTypeDefinition().createDisplayTextProvider();
    if (!providerDefinition) throw new SearError('Formula display provider is required for this test.');
    registry.register(providerDefinition);
    const provider = {
      getFormulaResult: () => ({ kind: 'error', code: '#REF!' }),
    };

    expect(registry.getDisplayText({ type: 'formula' }, { row: 2, col: 3, formulaResultProvider: provider })).toBe(
      '#REF!',
    );
  });

  it('warns once and falls back for an unregistered type', () => {
    const platform = createPlatform();
    const registry = new CellDisplayTextRegistry(platform);

    expect(registry.getDisplayText({ type: 'custom', value: 42 }, {})).toBe('42');
    expect(registry.getDisplayText({ type: 'custom', value: 43 }, {})).toBe('43');
    // test line 65 with undefined
    expect(registry.getDisplayText({ type: 'custom2' }, {})).toBe('');
    // test line 58 with symbol
    expect(registry.getDisplayText({ type: Symbol('custom3') }, {})).toBe('');
    expect(platform.warn).toHaveBeenCalledTimes(3);
  });

  it('restores providers through nested overrides in reverse release order', () => {
    const registry = new CellDisplayTextRegistry(createPlatform());
    const base = registry.register({
      cellType: 'custom',
      getDisplayText: () => 'base',
    });
    const middle = registry.register({
      cellType: 'custom',
      getDisplayText: () => 'middle',
    });
    const top = registry.register({
      cellType: 'custom',
      getDisplayText: () => 'top',
    });

    middle();
    expect(registry.getDisplayText({ type: 'custom' }, {})).toBe('top');
    top();
    expect(registry.getDisplayText({ type: 'custom' }, {})).toBe('middle');
    middle();
    expect(registry.getDisplayText({ type: 'custom' }, {})).toBe('base');
    base();
    expect(registry.getDisplayText({ type: 'custom', value: 'fallback' }, {})).toBe('fallback');
  });
});
