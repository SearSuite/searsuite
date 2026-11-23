import { FormulaResultProviderRegistry } from '../src/FormulaResultProviderRegistry';

describe('FormulaResultProviderRegistry', () => {
  it('keeps registered callbacks when the caller changes its provider', () => {
    const registry = new FormulaResultProviderRegistry();
    const provider = { getFormulaResult: () => 1 };
    registry.register({ provider });
    provider.getFormulaResult = () => 9;

    expect(registry.getFormulaResult(0, 0)).toBe(1);
  });

  it('returns the first defined result from registered providers by priority', () => {
    const registry = new FormulaResultProviderRegistry();
    registry.register({
      priority: 0,
      provider: {
        getFormulaResult: jest.fn(() => 1),
      },
    });
    registry.register({
      priority: 100,
      provider: {
        getFormulaResult(row, col) {
          return row === 2 && col === 3 ? 9 : void 0;
        },
      },
    });

    expect(registry.getFormulaResult(2, 3)).toBe(9);
    expect(registry.getFormulaResult(0, 0)).toBe(1);
  });

  it('uses the format of the provider that supplied the result', () => {
    const registry = new FormulaResultProviderRegistry();
    registry.register({ provider: {
      getFormulaResult: () => 1,
      getFormulaResultFormat: () => ({ kind: 'percent' }),
    } });
    registry.register({ priority: 10, provider: {
      getFormulaResult: (row) => row === 0 ? 2 : void 0,
      getFormulaResultFormat: () => ({ kind: 'currency', currency: 'USD' }),
    } });

    expect(registry.getFormulaResultFormat(0, 0)).toEqual({ kind: 'currency', currency: 'USD' });
    expect(registry.getFormulaResultFormat(1, 0)).toEqual({ kind: 'percent' });
  });

  it('disposes one provider registration without affecting the others', () => {
    const registry = new FormulaResultProviderRegistry();
    registry.register({ provider: { getFormulaResult: () => 1 } });
    const dispose = registry.register({ priority: 10, provider: { getFormulaResult: () => 2 } });

    expect(registry.getFormulaResult(0, 0)).toBe(2);
    dispose();
    dispose();
    expect(registry.getFormulaResult(0, 0)).toBe(1);
  });

  it('visits projected result coordinates once across providers', () => {
    const registry = new FormulaResultProviderRegistry();
    registry.register({ provider: {
      getFormulaResult: () => 1,
      forEachFormulaResultInRange: (_sr, _sc, _er, _ec, visit) => { visit(2, 3); visit(2, 4); },
    } });
    registry.register({ provider: {
      getFormulaResult: () => 2,
      forEachFormulaResultInRange: (_sr, _sc, _er, _ec, visit) => visit(2, 3),
    } });
    const positions: Array<[number, number]> = [];
    registry.forEachFormulaResultInRange(2, 3, 2, 4, (row, column) => positions.push([row, column]));
    expect(positions).toEqual([[2, 3], [2, 4]]);
  });
});
