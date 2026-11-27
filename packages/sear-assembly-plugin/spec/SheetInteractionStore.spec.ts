import {
  SheetInteractionReducerRegistry,
  SheetInteractionStore,
  type SheetInteractionReducer,
} from '@searsuite/sear-assembly-plugin';

describe('SheetInteractionStore', () => {
  it('routes registered signals, notifies active listeners, and releases subscriptions', () => {
    const registry = new SheetInteractionReducerRegistry();
    const store = new SheetInteractionStore(registry);
    const reducer: SheetInteractionReducer = {
      type: 'select',
      reduce(state, signal) {
        return {
          ...state,
          selection: {
            anchor: signal['anchor'] as [number, number],
            focus: signal['focus'] as [number, number],
            source: 'test',
          },
          selectionRevision: state.selectionRevision + 1,
        };
      },
    };
    const disposeReducer = registry.register(reducer);
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);

    store.apply({ type: 'select', anchor: [1, 2], focus: [3, 4] });

    expect(store.getState()).toMatchObject({
      selection: { anchor: [1, 2], focus: [3, 4], source: 'test' },
      selectionRevision: 1,
    });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.apply({ type: 'select', anchor: [0, 0], focus: [0, 0] });
    expect(listener).toHaveBeenCalledTimes(1);
    disposeReducer();
    expect(registry.get('select')).toBeUndefined();
  });

  it('rejects duplicate reducers and unknown signals without mutating state', () => {
    const registry = new SheetInteractionReducerRegistry();
    const reducer: SheetInteractionReducer = {
      type: 'same',
      reduce: (state) => state as never,
    };
    registry.register(reducer);
    const store = new SheetInteractionStore(registry);
    const initial = store.getState();

    expect(() => registry.register(reducer)).toThrow('already registered');
    expect(() => store.apply({ type: 'missing' })).toThrow('No interaction reducer');
    expect(store.getState()).toBe(initial);
  });

  it('keeps committed state and other listeners when one listener fails', () => {
    const registry = new SheetInteractionReducerRegistry();
    registry.register({
      type: 'change',
      reduce: (state) => ({ ...state, selectionRevision: state.selectionRevision + 1 }),
    });
    const platform = { warn: jest.fn() };
    const store = new SheetInteractionStore(registry, platform as never);
    const nextListener = jest.fn();
    store.subscribe(() => {
      throw new Error('listener failed');
    });
    store.subscribe(nextListener);

    expect(() => store.apply({ type: 'change' })).not.toThrow();
    expect(store.getState().selectionRevision).toBe(1);
    expect(nextListener).toHaveBeenCalledTimes(1);
    expect(platform.warn).toHaveBeenCalledWith(
      expect.stringContaining('Sheet interaction listener failed'),
      expect.any(Error),
    );
  });

  it('does not retain undeclared mutable fields from an extension reducer', () => {
    const registry = new SheetInteractionReducerRegistry();
    const retained = { value: 1 };
    registry.register({
      type: 'select',
      reduce: (state) => ({
        ...state,
        extra: retained,
        selection: { anchor: [1, 2], focus: [3, 4], source: 'test', extra: retained },
      }),
    });
    const store = new SheetInteractionStore(registry);

    store.apply({ type: 'select' });
    retained.value = 2;

    expect(store.getState()).toEqual({
      selection: { anchor: [1, 2], focus: [3, 4], source: 'test' },
      selectionRevision: 0,
      suppressedSelectionRevision: null,
      editSession: null,
    });
  });

  it('rejects a commit when a retained store has a forged guard method', () => {
    const store = new SheetInteractionStore(new SheetInteractionReducerRegistry());
    const initial = store.getState();
    store.enforceCommandBoundary(() => false);
    Object.assign(store, { assertCommandBoundary: () => void 0 });

    expect(() => store.commit({ ...initial, selectionRevision: 1 }, [])).toThrow(
      'must run through editor.commands.run',
    );
    expect(store.getState()).toBe(initial);
  });
});
