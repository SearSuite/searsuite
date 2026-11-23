import { CursorRegistry, CursorRuleKind, CursorToken, type TypeCursorRule } from '../src';
import { type SearCoreSheet } from '@searsuite/sear-assembly-core';

function createPosition(x = 10) {
  return {
    core: {} as SearCoreSheet,
    origin: { offsetX: x, offsetY: 20 } as MouseEvent,
    view: { x, y: 20 },
    world: { x: x + 100, y: 120 },
    target: { type: 'cell' },
  };
}

describe('CursorRegistry lifecycle', () => {
  it('keeps the registered rule after its source object changes', () => {
    const registry = new CursorRegistry();
    const rule: TypeCursorRule = { kind: CursorRuleKind.Type, cellType: 'custom', cursor: CursorToken.Cell };
    const unregister = registry.register(rule);
    rule.cellType = 'changed';
    rule.cursor = CursorToken.Pointer;

    expect(registry.resolve({ type: 'custom' })).toBe(CursorToken.Cell);
    unregister();
    expect(registry.resolve({ type: 'custom' })).toBe(CursorToken.Default);
  });

  it('restores an overridden type rule in reverse release order', () => {
    const registry = new CursorRegistry();
    const properties = { type: 'custom' };
    const base = registry.register({
      kind: CursorRuleKind.Type,
      cellType: 'custom',
      cursor: CursorToken.Cell,
    });
    const middle = registry.register({
      kind: CursorRuleKind.Type,
      cellType: 'custom',
      cursor: CursorToken.Pointer,
    });
    const top = registry.register({
      kind: CursorRuleKind.Type,
      cellType: 'custom',
      cursor: CursorToken.Text,
    });

    middle();
    expect(registry.resolve(properties)).toBe(CursorToken.Text);
    top();
    expect(registry.resolve(properties)).toBe(CursorToken.Pointer);
    middle();
    expect(registry.resolve(properties)).toBe(CursorToken.Cell);
    base();
    expect(registry.resolve(properties)).toBe(CursorToken.Default);
  });

  it('resolves rules using correct priority', () => {
    const registry = new CursorRegistry();
    const props = { type: 'testType', region: 'testRegion' } as any;

    // Register Low Predicate
    registry.register({
      kind: CursorRuleKind.Predicate,
      priority: 'low' as any,
      key: 'low',
      test: (p) => p.type === 'testType',
      cursor: CursorToken.Pointer,
    });
    expect(registry.resolve(props)).toBe(CursorToken.Pointer);

    // Register Type match (beats low pred)
    registry.register({
      kind: CursorRuleKind.Type,
      cellType: 'testType',
      cursor: CursorToken.Text,
    });
    expect(registry.resolve(props)).toBe(CursorToken.Text);

    // Register Region match (beats type match)
    registry.register({
      kind: CursorRuleKind.Region,
      region: 'testRegion' as any,
      cursor: CursorToken.Move,
    });
    expect(registry.resolve(props)).toBe(CursorToken.Move);

    // Register High Predicate (beats region match)
    registry.register({
      kind: CursorRuleKind.Predicate,
      priority: 'high' as any,
      key: 'high',
      test: (p) => (p.region as unknown as string) === 'testRegion',
      cursor: CursorToken.Cell,
    });
    expect(registry.resolve(props)).toBe(CursorToken.Cell);

    // Missing props
    expect(registry.resolve({} as any)).toBe(CursorToken.Default);
  });

  it('resolves the highest matching position layer before structural rules', () => {
    const registry = new CursorRegistry();
    registry.register({
      kind: CursorRuleKind.Region,
      region: 'grid' as never,
      cursor: CursorToken.Cell,
    });
    registry.register({
      key: 'lower',
      kind: CursorRuleKind.Position,
      layer: 10,
      test: (position) => position.view.x === 10,
      cursor: CursorToken.Pointer,
    });
    registry.register({
      key: 'higher',
      kind: CursorRuleKind.Position,
      layer: 20,
      test: (position) => position.world.x === 110,
      cursor: CursorToken.ColumnResize,
    });

    expect(registry.resolve({ type: 'cell', region: 'grid' } as never, createPosition())).toBe(
      CursorToken.ColumnResize,
    );
  });

  it('warns once and deterministically uses the last matching rule at the same position layer', () => {
    const platform = { warn: jest.fn() };
    const registry = new CursorRegistry(platform as never);
    registry.register({
      key: 'first',
      kind: CursorRuleKind.Position,
      layer: 10,
      test: () => true,
      cursor: CursorToken.RowResize,
    });
    const disposeSecond = registry.register({
      key: 'second',
      kind: CursorRuleKind.Position,
      layer: 10,
      test: () => true,
      cursor: CursorToken.ColumnResize,
    });

    expect(registry.resolve(null, createPosition())).toBe(CursorToken.ColumnResize);
    expect(registry.resolve(null, createPosition())).toBe(CursorToken.ColumnResize);
    expect(platform.warn).toHaveBeenCalledTimes(1);
    disposeSecond();
    expect(registry.resolve(null, createPosition())).toBe(CursorToken.RowResize);
  });

  it('keeps conflict resolution safe when no platform diagnostic adapter is registered', () => {
    const registry = new CursorRegistry();
    registry.register({
      key: 'first',
      kind: CursorRuleKind.Position,
      layer: 10,
      test: () => true,
      cursor: CursorToken.RowResize,
    });
    registry.register({
      key: 'second',
      kind: CursorRuleKind.Position,
      layer: 10,
      test: () => true,
      cursor: CursorToken.ColumnResize,
    });

    expect(registry.resolve(null, createPosition())).toBe(CursorToken.ColumnResize);
  });
});
