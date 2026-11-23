import { type Platform } from '@searsuite/sear-foundation-platform';

import {
  defineEventObservation,
  defineStateObservation,
  ObservationError,
  ObservationErrorCode,
  ObservationRegistry,
} from '../src';

describe('ObservationRegistry', () => {
  it('detaches state snapshots and events when the editor installs a read boundary', () => {
    const registry = new ObservationRegistry();
    const observation = defineStateObservation<{ nested: { value: number } }>('test.detached');
    const state = { nested: { value: 1 } };
    let publish: ((value: typeof state) => void) | undefined;
    registry.register(observation, {
      getSnapshot: () => state,
      subscribe(listener) {
        publish = listener;
        return () => { publish = undefined; };
      },
    });
    registry.enforceWriteBoundary(() => void 0, (callback) => callback(), (value) => {
      const current = value as typeof state;
      return { nested: { ...current.nested } };
    });

    registry.getSnapshot(observation).nested.value = 2;
    registry.subscribe(observation, (value) => { value.nested.value = 3; });
    publish?.(state);
    expect(state.nested.value).toBe(1);
  });

  it('delivers the current state snapshot followed by future state changes', () => {
    const registry = new ObservationRegistry();
    const observation = defineStateObservation<number>('test.count');
    const listeners = new Set<(value: number) => void>();
    let value = 1;
    registry.register(observation, {
      getSnapshot: () => value,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    });
    const received: number[] = [];

    const dispose = registry.subscribe(observation, (next) => received.push(next));
    value = 2;
    listeners.forEach((listener) => listener(value));

    expect(received).toEqual([1, 2]);
    dispose();
    dispose();
    value = 3;
    listeners.forEach((listener) => listener(value));
    expect(received).toEqual([1, 2]);
  });

  it('delivers a state snapshot before updates emitted while connecting the source', () => {
    const registry = new ObservationRegistry();
    const observation = defineStateObservation<number>('test.connecting');
    registry.register(observation, {
      getSnapshot: () => 1,
      subscribe(listener) {
        listener(2);
        return () => void 0;
      },
    });
    const received: number[] = [];

    registry.subscribe(observation, (value) => received.push(value));

    expect(received).toEqual([1, 2]);
  });

  it('keeps source methods stable after the caller changes the source object', () => {
    const registry = new ObservationRegistry();
    const observation = defineStateObservation<number>('test.stableSource');
    const source = {
      current: 3,
      getSnapshot() { return this.current; },
      subscribe: () => () => void 0,
    };
    registry.register(observation, source);
    source.getSnapshot = () => 99;

    expect(registry.getSnapshot(observation)).toBe(3);
  });

  it('keeps registered definition metadata and disposal stable after the caller changes its definition', () => {
    const registry = new ObservationRegistry();
    const definition = { id: 'test.mutable', kind: 'state' as const };
    const source = { getSnapshot: () => 7, subscribe: () => () => void 0 };
    const unregister = registry.register(definition, source);
    const registered = registry.getRegisteredObservations()[0];

    expect(() => Object.assign(definition, { id: 'test.changed', kind: 'event' })).toThrow();
    expect(registered).toEqual({ id: 'test.mutable', kind: 'state' });
    expect(registered).toBe(definition);
    expect(Object.isFrozen(registered)).toBe(true);
    expect(registry.getRegisteredObservations()).toEqual([registered]);
    expect(registry.has('test.mutable')).toBe(true);

    unregister();
    expect(registry.has('test.mutable')).toBe(false);
  });

  it('delivers event observations without inventing an initial value', () => {
    const registry = new ObservationRegistry();
    const observation = defineEventObservation<string>('test.event');
    let emit: ((value: string) => void) | undefined;
    registry.register(observation, {
      subscribe(listener) {
        emit = listener;
        return () => {
          emit = void 0;
        };
      },
    });
    const listener = jest.fn();

    const dispose = registry.subscribe(observation, listener);
    expect(listener).not.toHaveBeenCalled();
    emit?.('ready');
    expect(listener).toHaveBeenCalledWith('ready');
    dispose();
  });

  it('disposes subscriptions on unregister or destroy', () => {
    const registry = new ObservationRegistry();
    const first = defineEventObservation<number>('test.first');
    const second = defineEventObservation<number>('test.second');
    const firstDispose = jest.fn();
    const secondDispose = jest.fn();
    const unregister = registry.register(first, { subscribe: () => firstDispose });
    registry.register(second, { subscribe: () => secondDispose });
    const firstSubscription = registry.subscribe(first, () => void 0);
    registry.subscribe(second, () => void 0);

    unregister();
    expect(firstDispose).toHaveBeenCalledTimes(1);
    firstSubscription();
    registry.destroy();
    registry.destroy();
    expect(secondDispose).toHaveBeenCalledTimes(1);
  });

  it('reports listener failures without interrupting other subscribers', () => {
    const warn = jest.fn();
    const registry = new ObservationRegistry({ warn } as unknown as Platform);
    const observation = defineEventObservation<number>('test.failure');
    const listeners = new Set<(value: number) => void>();
    registry.register(observation, {
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    });
    const error = new Error('failure');
    const next = jest.fn();
    registry.subscribe(observation, () => {
      throw error;
    });
    registry.subscribe(observation, next);

    listeners.forEach((listener) => listener(4));

    expect(warn).toHaveBeenCalledWith('Observation "test.failure" listener failed.', error);
    expect(next).toHaveBeenCalledWith(4);
  });

  it('delivers host listeners outside the editor write scope', () => {
    const registry = new ObservationRegistry();
    const observation = defineEventObservation<number>('test.scope');
    let publish: ((value: number) => void) | undefined;
    let hasWriteAuthority = true;
    registry.register(observation, {
      subscribe(listener) {
        publish = listener;
        return () => { publish = undefined; };
      },
    });
    registry.enforceWriteBoundary(
      () => { if (!hasWriteAuthority) throw new Error('write denied'); },
      (callback) => {
        hasWriteAuthority = false;
        try { return callback(); } finally { hasWriteAuthority = true; }
      },
    );
    const attemptedWrite = jest.fn(() => expect(() => registry.register(
      defineEventObservation('test.reentrant'), { subscribe: () => () => void 0 },
    )).toThrow('write denied'));
    registry.subscribe(observation, attemptedWrite);

    publish?.(1);

    expect(attemptedWrite).toHaveBeenCalledTimes(1);
    expect(hasWriteAuthority).toBe(true);
  });

  it('rejects duplicate, synthetic, missing, invalid, and destroyed definitions', () => {
    const registry = new ObservationRegistry();
    const observation = defineStateObservation<number>('test.state');
    const source = { getSnapshot: () => 1, subscribe: () => () => void 0 };
    registry.register(observation, source);

    expectObservationError(() => registry.register(observation, source), ObservationErrorCode.AlreadyRegistered);
    expectObservationError(
      () => registry.getSnapshot(defineStateObservation<number>('test.state')),
      ObservationErrorCode.DefinitionMismatch,
    );
    expectObservationError(
      () => registry.subscribe(defineEventObservation('test.missing'), () => void 0),
      ObservationErrorCode.NotRegistered,
    );
    expect(() => registry.register(defineEventObservation(''), { subscribe: () => () => void 0 })).toThrow(
      ObservationError,
    );
    expectObservationError(
      () =>
        registry.register(defineStateObservation<number>('test.invalidState'), {
          subscribe: () => () => void 0,
        } as never),
      ObservationErrorCode.SnapshotUnavailable,
    );

    registry.destroy();
    expectObservationError(() => registry.getSnapshot(observation), ObservationErrorCode.RegistryDestroyed);
  });

  it('lists registered definitions by stable id', () => {
    const registry = new ObservationRegistry();
    const later = defineEventObservation('z.event');
    const earlier = defineEventObservation('a.event');
    registry.register(later, { subscribe: () => () => void 0 });
    registry.register(earlier, { subscribe: () => () => void 0 });

    expect(registry.has(later)).toBe(true);
    expect(registry.has('missing')).toBe(false);
    expect(registry.getRegisteredObservations()).toEqual([earlier, later]);
  });
});

function expectObservationError(action: () => unknown, code: string): void {
  try {
    action();
  } catch (error) {
    expect(error).toMatchObject({ code });
    return;
  }
  throw new Error(`Expected observation error ${code}.`);
}
