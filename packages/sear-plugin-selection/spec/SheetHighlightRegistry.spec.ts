import { SheetHighlightRegistry, SheetHighlightProvider, SheetHighlightContext } from '../src/SheetHighlightRegistry';

describe('SheetHighlightRegistry', () => {
  it('throws on duplicate registration', () => {
    const registry = new SheetHighlightRegistry();
    const provider: SheetHighlightProvider = {
      key: 'test',
      getHighlights: () => [],
    };
    registry.register(provider);
    expect(() => registry.register(provider)).toThrow('A sheet highlight provider named "test" is already registered.');
  });

  it('can set enabled and invalidate', () => {
    const registry = new SheetHighlightRegistry();
    const provider: SheetHighlightProvider = {
      key: 'test',
      getHighlights: () => [],
    };
    registry.register(provider);

    // valid toggle
    registry.setEnabled('test', false);
    expect(registry.getHighlights({} as SheetHighlightContext)).toEqual([]);

    // toggle non-existent or same value
    registry.setEnabled('missing', false);
    registry.setEnabled('test', false);

    const listener = jest.fn();
    const unsubscribe = registry.subscribe(listener);
    registry.invalidate();
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('continues notifying after a listener throws', () => {
    const registry = new SheetHighlightRegistry();
    const received = jest.fn();
    registry.subscribe(() => { throw new Error('observer failed'); });
    registry.subscribe(received);
    expect(() => registry.invalidate()).not.toThrow();
    expect(received).toHaveBeenCalledTimes(1);
  });

  it('unregisters providers independently and idempotently', () => {
    const registry = new SheetHighlightRegistry();
    const provider1: SheetHighlightProvider = { key: 'test', getHighlights: () => [{ start: [0, 0], end: [0, 0] }] };
    const provider2: SheetHighlightProvider = { key: 'test2', getHighlights: () => [{ start: [1, 1], end: [1, 1] }] };

    const unregister1 = registry.register(provider1);
    const unregister2 = registry.register(provider2);
    unregister2();
    unregister2();
    expect(registry.getHighlights({} as SheetHighlightContext)).toEqual([{ start: [0, 0], end: [0, 0] }]);
    unregister1();
    expect(registry.getHighlights({} as SheetHighlightContext)).toEqual([]);
  });

  it('keeps the registered key and callback after the provider object changes', () => {
    const registry = new SheetHighlightRegistry();
    const provider: SheetHighlightProvider = { key: 'test', getHighlights: () => [{ start: [0, 0], end: [0, 0] }] };
    const unregister = registry.register(provider);
    provider.key = 'changed';
    provider.getHighlights = () => [{ start: [1, 1], end: [1, 1] }];
    expect(registry.getHighlights({} as SheetHighlightContext)).toEqual([{ start: [0, 0], end: [0, 0] }]);
    unregister();
    expect(registry.getHighlights({} as SheetHighlightContext)).toEqual([]);
  });
});
