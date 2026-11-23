import { SheetCellVisualReaderErrorCode, SheetCellVisualReaderRegistry } from '../src';
import { SheetHorizontalAlignment } from '@searsuite/sear-domain-cell-types';

describe('SheetCellVisualReaderRegistry', () => {
  it('retains visual reader definitions independently of plugin-owned registration objects', () => {
    const registry = new SheetCellVisualReaderRegistry();
    const position = { rowIndex: 0, columnIndex: 0 };
    const base = { id: 'base', properties: ['fill'] as ['fill'], read: () => ({ fill: '#ffffff' }) };
    const override = { id: 'override', priority: 10, properties: ['fill'] as ['fill'],
      read: () => ({ fill: '#ff0000' }) };
    const conditional = { id: 'conditional', properties: ['textColor'] as ['textColor'],
      readHighestPriority: () => 3,
      read: () => [{ id: 'rule', priority: 3, properties: { textColor: '#222222' } }] };
    const disposeBase = registry.register(base);
    const disposeOverride = registry.registerOverride(override);
    const disposeConditional = registry.registerConditional(conditional);

    Object.assign(base, { id: 'forged-base', properties: ['stroke'], read: () => ({ stroke: '#000000' }) });
    Object.assign(override, { id: 'forged-override', priority: -1, read: () => ({ fill: '#00ff00' }) });
    Object.assign(conditional, { id: 'forged-conditional', properties: ['stroke'],
      readHighestPriority: () => 100, read: () => [] });
    expect(registry.read(position)).toEqual({ fill: '#ff0000', textColor: '#222222' });
    expect(registry.nextConditionalPriority()).toBe(4);

    disposeConditional();
    disposeOverride();
    disposeBase();
    expect(registry.read(position)).toEqual({});
  });

  it('composes conditional rules across owners by rule priority and preserves visual layers', () => {
    const registry = new SheetCellVisualReaderRegistry();
    registry.register({ id: 'base', properties: ['fill'], read: () => ({ fill: '#FFFFFF' }) });
    registry.registerConditional({
      id: 'highlight', properties: ['fill', 'textColor'], readHighestPriority: () => 3,
      read: () => [{ id: 'highlight-1', priority: 3, properties: { fill: '#FF0000', textColor: '#222222' } }],
    });
    registry.registerConditional({
      id: 'visual', properties: ['fill'], readHighestPriority: () => 2,
      read: () => [{ id: 'scale-1', priority: 2, properties: { fill: '#00FF00' }, layers: [{
        slot: 'dataBar', x: 0, y: 0.2, width: 0.5, height: 0.6, fill: '#0000FF',
      }] }],
    });
    expect(registry.readVisual({ rowIndex: 1, columnIndex: 2 })).toEqual({
      properties: { fill: '#FF0000', textColor: '#222222' },
      layers: [{ slot: 'dataBar', x: 0, y: 0.2, width: 0.5, height: 0.6, fill: '#0000FF' }],
    });
    expect(registry.nextConditionalPriority()).toBe(4);
  });

  it.each([false, true])('paints icons over bars regardless of rule order (icon first=%s)', (iconFirst) => {
    const registry = new SheetCellVisualReaderRegistry();
    const icon = { slot: 'iconSet', zIndex: 1, x: 0, y: 0, width: 1, height: 1, icon: { shape: 'up', color: '#00AA00' } } as const;
    const bar = { slot: 'dataBar', x: 0, y: 0.2, width: 0.8, height: 0.6, fill: '#0000FF' } as const;
    registry.registerConditional({
      id: 'visual', properties: [],
      read: () => iconFirst
        ? [{ id: 'icon', priority: 1, layers: [icon] }, { id: 'bar', priority: 2, layers: [bar] }]
        : [{ id: 'bar', priority: 1, layers: [bar] }, { id: 'icon', priority: 2, layers: [icon] }],
    });
    expect(registry.readVisual({ rowIndex: 0, columnIndex: 0 }).layers).toEqual([bar, icon]);
  });

  it('rejects an invalid priority published by a conditional rule owner', () => {
    const registry = new SheetCellVisualReaderRegistry();
    registry.registerConditional({ id: 'invalid', properties: ['fill'], readHighestPriority: () => Infinity, read: () => [] });
    expect(() => registry.nextConditionalPriority()).toThrow(
      expect.objectContaining({ code: SheetCellVisualReaderErrorCode.InvalidPriority }),
    );
  });
  it.each([false, true])(
    'composes overrides by priority independently of registration order (reverse=%s)',
    (reverse) => {
      const registry = new SheetCellVisualReaderRegistry();
      const overrides = [
        { id: 'low', priority: 10, properties: ['fill'] as const, read: () => ({ fill: '#eeeeee' }) },
        { id: 'high', priority: 20, properties: ['fill'] as const, read: () => ({ fill: '#ff0000' }) },
      ];
      for (const override of reverse ? overrides.reverse() : overrides) registry.registerOverride(override);
      registry.register({
        id: 'base',
        properties: ['fill', 'stroke'],
        read: () => ({ fill: '#ffffff', stroke: '#000000' }),
      });
      expect(registry.read({ rowIndex: 0, columnIndex: 0 })).toEqual({ fill: '#ff0000', stroke: '#000000' });
    },
  );

  it('preserves underlying values for inactive or undefined overrides and reads current conditions', () => {
    const registry = new SheetCellVisualReaderRegistry();
    let active = true;
    registry.register({ id: 'base', properties: ['fill'], read: () => ({ fill: '#ffffff' }) });
    registry.registerOverride({
      id: 'conditional',
      priority: 10,
      properties: ['fill'],
      read: () => (active ? { fill: '#ff0000' } : {}),
    });
    registry.registerOverride({
      id: 'inactive',
      priority: 20,
      properties: ['fill'],
      read: () => ({ fill: undefined }),
    });
    expect(registry.read({ rowIndex: 0, columnIndex: 0 }).fill).toBe('#ff0000');
    active = false;
    expect(registry.read({ rowIndex: 0, columnIndex: 0 }).fill).toBe('#ffffff');
  });

  it('rejects ambiguous override priorities but allows disjoint properties at the same priority', () => {
    const registry = new SheetCellVisualReaderRegistry();
    registry.registerOverride({ id: 'fill', priority: 10, properties: ['fill'], read: () => ({ fill: '#ffffff' }) });
    expect(() =>
      registry.registerOverride({ id: 'conflict', priority: 10, properties: ['fill'], read: () => ({}) }),
    ).toThrow(expect.objectContaining({ code: SheetCellVisualReaderErrorCode.OverrideConflict }));
    registry.registerOverride({
      id: 'stroke',
      priority: 10,
      properties: ['stroke'],
      read: () => ({ stroke: '#000000' }),
    });
    expect(registry.read({ rowIndex: 0, columnIndex: 0 })).toEqual({ fill: '#ffffff', stroke: '#000000' });
  });

  it.each([NaN, Infinity, -Infinity])('rejects non-finite override priority %s', (priority) => {
    const registry = new SheetCellVisualReaderRegistry();
    expect(() =>
      registry.registerOverride({ id: 'invalid', priority, properties: ['fill'], read: () => ({}) }),
    ).toThrow(expect.objectContaining({ code: SheetCellVisualReaderErrorCode.InvalidPriority }));
    registry.registerOverride({ id: 'invalid', priority: 0, properties: ['fill'], read: () => ({}) });
  });

  it('rejects duplicate ids across base readers and overrides in both registration orders', () => {
    const registry = new SheetCellVisualReaderRegistry();
    registry.register({ id: 'base', properties: ['fill'], read: () => ({}) });
    expect(() =>
      registry.registerOverride({ id: 'base', priority: 10, properties: ['stroke'], read: () => ({}) }),
    ).toThrow(expect.objectContaining({ code: SheetCellVisualReaderErrorCode.DuplicateReader }));
    registry.registerOverride({ id: 'override', priority: 10, properties: ['fill'], read: () => ({}) });
    expect(() => registry.register({ id: 'override', properties: ['stroke'], read: () => ({}) })).toThrow(
      expect.objectContaining({ code: SheetCellVisualReaderErrorCode.DuplicateReader }),
    );
    expect(() =>
      registry.registerOverride({ id: 'override', priority: 20, properties: ['stroke'], read: () => ({}) }),
    ).toThrow(expect.objectContaining({ code: SheetCellVisualReaderErrorCode.DuplicateReader }));
  });

  it('validates declared override properties', () => {
    const registry = new SheetCellVisualReaderRegistry();
    registry.registerOverride({
      id: 'invalid',
      priority: 10,
      properties: ['fill'],
      read: () => ({ stroke: '#000000' }),
    });
    expect(() => registry.read({ rowIndex: 0, columnIndex: 0 })).toThrow(
      expect.objectContaining({ code: SheetCellVisualReaderErrorCode.UndeclaredProperty }),
    );
  });

  it('releases override priority slots and ignores stale disposers after destroy and re-registration', () => {
    const registry = new SheetCellVisualReaderRegistry();
    registry.register({ id: 'base', properties: ['fill'], read: () => ({ fill: '#ffffff' }) });
    const dispose = registry.registerOverride({
      id: 'override',
      priority: 10,
      properties: ['fill'],
      read: () => ({ fill: '#ff0000' }),
    });
    dispose();
    dispose();
    expect(registry.read({ rowIndex: 0, columnIndex: 0 }).fill).toBe('#ffffff');
    const staleDispose = registry.registerOverride({
      id: 'override',
      priority: 10,
      properties: ['fill'],
      read: () => ({ fill: '#ff0000' }),
    });
    registry.destroy();
    expect(registry.read({ rowIndex: 0, columnIndex: 0 })).toEqual({});
    registry.registerOverride({
      id: 'override',
      priority: 10,
      properties: ['fill'],
      read: () => ({ fill: '#000000' }),
    });
    staleDispose();
    expect(registry.read({ rowIndex: 0, columnIndex: 0 }).fill).toBe('#000000');
  });

  it('combines independently owned visual properties', () => {
    const registry = new SheetCellVisualReaderRegistry();
    registry.register({
      id: 'alignment',
      properties: ['horizontalAlign'],
      read: ({ columnIndex }) => ({
        horizontalAlign: columnIndex === 1 ? SheetHorizontalAlignment.Right : SheetHorizontalAlignment.Left,
      }),
    });
    registry.register({
      id: 'fill',
      properties: ['fill'],
      read: ({ rowIndex }) => (rowIndex === 2 ? { fill: '#ffcc00' } : {}),
    });

    expect(registry.read({ rowIndex: 2, columnIndex: 1 })).toEqual({
      horizontalAlign: 'right',
      fill: '#ffcc00',
    });
  });

  it('rejects duplicate readers and conflicting property owners', () => {
    const registry = new SheetCellVisualReaderRegistry();
    registry.register({ id: 'alignment', properties: ['horizontalAlign'], read: () => ({}) });

    expect(() => registry.register({ id: 'alignment', properties: ['verticalAlign'], read: () => ({}) })).toThrow(
      expect.objectContaining({ code: SheetCellVisualReaderErrorCode.DuplicateReader }),
    );
    expect(() =>
      registry.register({ id: 'other-alignment', properties: ['horizontalAlign'], read: () => ({}) }),
    ).toThrow(expect.objectContaining({ code: SheetCellVisualReaderErrorCode.PropertyConflict }));
  });

  it('rejects undeclared output properties', () => {
    const registry = new SheetCellVisualReaderRegistry();
    registry.register({
      id: 'invalid',
      properties: ['fill'],
      read: () => ({ fill: '#ffffff', stroke: '#000000' }),
    });

    expect(() => registry.read({ rowIndex: 0, columnIndex: 0 })).toThrow(
      expect.objectContaining({ code: SheetCellVisualReaderErrorCode.UndeclaredProperty }),
    );
  });

  it('removes registrations through idempotent disposers and destroy', () => {
    const registry = new SheetCellVisualReaderRegistry();
    const dispose = registry.register({
      id: 'fill',
      properties: ['fill'],
      read: () => ({ fill: '#ffffff' }),
    });

    dispose();
    dispose();
    expect(registry.read({ rowIndex: 0, columnIndex: 0 })).toEqual({});

    registry.register({ id: 'fill', properties: ['fill'], read: () => ({ fill: '#000000' }) });
    registry.destroy();
    expect(registry.read({ rowIndex: 0, columnIndex: 0 })).toEqual({});
  });
});
