import { SheetInteractionReducerRegistry } from '../src/SheetInteractionReducerRegistry';

describe('SheetInteractionReducerRegistry', () => {
  it('registers and unregisters reducers', () => {
    const registry = new SheetInteractionReducerRegistry();
    const reducer = { type: 'my-type', reduce: (s: any) => s };

    const unregister = registry.register(reducer);
    expect(registry.get('my-type')).toMatchObject({ type: 'my-type', reduce: expect.any(Function) });
    expect(registry.get('my-type')).not.toBe(reducer);

    // unregister
    unregister();
    expect(registry.get('my-type')).toBeUndefined();

    // calling unregister again safely does nothing
    unregister();
    expect(registry.get('my-type')).toBeUndefined();
  });

  it('throws on duplicate type', () => {
    const registry = new SheetInteractionReducerRegistry();
    const reducer = { type: 'dup', reduce: (s: any) => s };
    registry.register(reducer);

    const reducer2 = { type: 'dup', reduce: (s: any) => s };
    expect(() => registry.register(reducer2)).toThrow();
  });

  it('does not let a retained reducer object change registered behavior', () => {
    const registry = new SheetInteractionReducerRegistry();
    const reducer = {
      type: 'custom',
      reduce: () => 'original',
    };
    const unregister = registry.register(reducer as never);
    reducer.type = 'changed';
    reducer.reduce = () => 'replacement';

    expect(registry.get('custom')!.reduce({} as never, {} as never)).toBe('original');
    expect(() => { (registry.get('custom') as { type: string }).type = 'changed'; }).toThrow();
    unregister();
    expect(registry.get('custom')).toBeUndefined();
  });
});
