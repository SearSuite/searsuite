import {
  SessionStateError,
  SessionStateErrorCode,
  SessionStateRegistry,
  SessionStateRestorePhase,
  defineSessionState,
  type SessionStateRestorePhase as SessionStateRestorePhaseType,
} from '../src';
import { Rect } from '@searsuite/sear-foundation-rect';

describe('SessionStateRegistry', () => {
  it('retains session adapter callbacks and definition identity after registration', () => {
    const registry = new SessionStateRegistry();
    const definition = { id: 'test.retained-adapter' };
    const restored: number[] = [];
    const adapter = {
      restorePhase: SessionStateRestorePhase.BeforeInitialize,
      capture: () => 7,
      restore: (value: number) => { restored.push(value); },
    };
    registry.register(definition, adapter);
    Object.assign(definition, { id: 'test.forged' });
    Object.assign(adapter, { restorePhase: SessionStateRestorePhase.AfterInitialize,
      capture: () => 99, restore: () => { throw new Error('forged'); } });

    registry.loadSnapshot({ 'test.retained-adapter': 3 });
    registry.restorePhase(SessionStateRestorePhase.BeforeInitialize);
    expect(restored).toEqual([3]);
    expect(registry.capture()).toEqual({ 'test.retained-adapter': 7 });
    expect(registry.getRegisteredStateIds()).toEqual(['test.retained-adapter']);
  });

  it('restores contributors in explicit lifecycle phases and captures one unified snapshot', () => {
    const earlyDefinition = defineSessionState<{ value: number }>('test.early');
    const runtimeDefinition = defineSessionState<string>('test.runtime');
    const registry = new SessionStateRegistry();
    let earlyValue = 1;
    let runtimeValue = 'initial';
    registry.register(earlyDefinition, {
      restorePhase: SessionStateRestorePhase.BeforeInitialize,
      capture: () => ({ value: earlyValue }),
      restore: (state) => {
        earlyValue = state.value;
      },
    });
    registry.register(runtimeDefinition, {
      restorePhase: SessionStateRestorePhase.AfterInitialize,
      capture: () => runtimeValue,
      restore: (state) => {
        runtimeValue = state;
      },
    });
    registry.loadSnapshot({ 'test.early': { value: 4 }, 'test.runtime': 'restored' });

    registry.restorePhase(SessionStateRestorePhase.BeforeInitialize);
    expect(earlyValue).toBe(4);
    expect(runtimeValue).toBe('initial');

    registry.restorePhase(SessionStateRestorePhase.AfterInitialize);
    expect(runtimeValue).toBe('restored');
    expect(registry.capture()).toEqual({ 'test.early': { value: 4 }, 'test.runtime': 'restored' });
    expect(registry.getCompletedRestorePhases()).toEqual([
      SessionStateRestorePhase.BeforeInitialize,
      SessionStateRestorePhase.AfterInitialize,
    ]);
  });

  it('accepts later-phase contributors before their phase and preserves state whose owner is absent', () => {
    const earlyDefinition = defineSessionState<string>('test.late-early');
    const runtimeDefinition = defineSessionState<string>('test.late-runtime');
    const registry = new SessionStateRegistry();
    const earlyRestore = jest.fn();
    const runtimeRestore = jest.fn();
    registry.register(earlyDefinition, {
      restorePhase: SessionStateRestorePhase.BeforeInitialize,
      capture: () => 'captured-early',
      restore: earlyRestore,
    });
    registry.loadSnapshot({
      'test.late-early': 'early',
      'test.late-runtime': 'runtime',
      'test.missing': { enabled: true },
    });
    registry.restorePhase(SessionStateRestorePhase.BeforeInitialize);
    registry.register(runtimeDefinition, {
      restorePhase: SessionStateRestorePhase.AfterInitialize,
      capture: () => 'captured-runtime',
      restore: runtimeRestore,
    });

    expect(earlyRestore).toHaveBeenCalledWith('early');
    expect(runtimeRestore).not.toHaveBeenCalled();
    registry.restorePhase(SessionStateRestorePhase.AfterInitialize);
    expect(runtimeRestore).toHaveBeenCalledWith('runtime');
    expect(registry.capture()).toEqual({
      'test.late-early': 'captured-early',
      'test.late-runtime': 'captured-runtime',
      'test.missing': { enabled: true },
    });
  });

  it('orders same-phase restoration by typed contributor dependencies', () => {
    const zoom = defineSessionState<number>('test.zoom');
    const viewport = defineSessionState<number>('test.viewport');
    const registry = new SessionStateRegistry();
    const restored: string[] = [];
    registry.register(viewport, {
      restorePhase: SessionStateRestorePhase.AfterInitialize,
      restoreAfter: [zoom],
      capture: () => 1,
      restore: () => restored.push('viewport'),
    });
    registry.register(zoom, {
      restorePhase: SessionStateRestorePhase.AfterInitialize,
      capture: () => 1,
      restore: () => restored.push('zoom'),
    });
    registry.loadSnapshot({ 'test.viewport': 1, 'test.zoom': 1 });
    registry.restorePhase(SessionStateRestorePhase.BeforeInitialize);
    registry.restorePhase(SessionStateRestorePhase.AfterInitialize);

    expect(restored).toEqual(['zoom', 'viewport']);
  });

  it('supports idempotent disposal, omitted values, repeated phase calls, and clearing', () => {
    const definition = defineSessionState<string>('test.disposable');
    const registry = new SessionStateRegistry();
    const restore = jest.fn();
    registry.loadSnapshot({ 'test.disposable': 'old' });
    const dispose = registry.register(definition, {
      restorePhase: SessionStateRestorePhase.BeforeInitialize,
      capture: () => void 0,
      restore,
    });

    registry.restorePhase(SessionStateRestorePhase.BeforeInitialize);
    registry.restorePhase(SessionStateRestorePhase.BeforeInitialize);
    expect(restore).toHaveBeenCalledTimes(1);
    expect(registry.capture()).toEqual({});
    dispose();
    dispose();
    expect(registry.getRegisteredStateIds()).toEqual([]);

    registry.clear();
    expect(registry.capture()).toEqual({});
    expect(registry.getCompletedRestorePhases()).toEqual([]);
  });

  it('seals restoration after editor setup while allowing owner cleanup', () => {
    const registry = new SessionStateRegistry();
    const owner = {};
    const definition = defineSessionState<number>('test.sealed');
    const dispose = registry.register(definition, {
      restorePhase: SessionStateRestorePhase.BeforeInitialize,
      capture: () => 1,
      restore: () => void 0,
    });
    registry.loadSnapshot({});
    registry.restorePhase(SessionStateRestorePhase.BeforeInitialize);
    registry.restorePhase(SessionStateRestorePhase.AfterInitialize);
    registry.sealRestoration(owner);
    Object.assign(registry, { assertRestorationOpen: () => {} });

    dispose();
    expect(registry.getRegisteredStateIds()).toEqual([definition.id]);
    expect(() => registry.loadSnapshot({})).toThrow('restoration is closed');
    expect(() => registry.restorePhase(SessionStateRestorePhase.BeforeInitialize)).toThrow('restoration is closed');
    expect(Reflect.get(registry, 'restoreRegistration')).toBeUndefined();
    expect(Reflect.get(registry, 'getRestoreOrder')).toBeUndefined();
    expect(() => registry.clear()).toThrow('cleanup requires its owner');
    registry.clear(owner);
  });

  it('keeps captured and loaded session values detached from retained handles', () => {
    const registry = new SessionStateRegistry();
    const definition = defineSessionState<{ nested: { value: number } }>('test.detached');
    const ownerState = { nested: { value: 1 } };
    const input = { 'test.missing': { nested: { value: 2 } } };
    registry.register(definition, {
      restorePhase: SessionStateRestorePhase.BeforeInitialize,
      capture: () => ownerState,
      restore: () => void 0,
    });
    registry.loadSnapshot(input);
    input['test.missing'].nested.value = 9;

    const captured = registry.capture();
    (captured[definition.id] as typeof ownerState).nested.value = 8;
    (captured['test.missing'] as typeof ownerState).nested.value = 8;

    expect(ownerState.nested.value).toBe(1);
    expect(registry.capture()).toEqual({
      [definition.id]: { nested: { value: 1 } },
      'test.missing': { nested: { value: 2 } },
    });
  });

  it('rejects custom session values whose clone returns the same handle', () => {
    class SharedSnapshot {
      public clone(): SharedSnapshot { return this; }
    }
    const registry = new SessionStateRegistry();
    expect(() => registry.loadSnapshot({ 'test.shared': new SharedSnapshot() })).toThrow(SessionStateError);
  });

  it('rejects custom clone implementations that retain nested mutable values', () => {
    class ShallowSnapshot {
      public constructor(public value: { nested: { count: number } }) {}
      public clone(): ShallowSnapshot { return new ShallowSnapshot({ ...this.value }); }
    }
    const registry = new SessionStateRegistry();
    expect(() => registry.loadSnapshot({ 'test.shallow': new ShallowSnapshot({ nested: { count: 1 } }) }))
      .toThrow(SessionStateError);
  });

  it('rejects custom snapshots whose private storage cannot be checked for sharing', () => {
    class HiddenSnapshot {
      readonly #values: Map<string, number>;
      public constructor(values = new Map([['value', 1]])) { this.#values = values; }
      public cloneDetached(): HiddenSnapshot { return new HiddenSnapshot(this.#values); }
      public set(value: number): void { this.#values.set('value', value); }
    }
    const registry = new SessionStateRegistry();
    expect(() => registry.loadSnapshot({ 'test.hidden': new HiddenSnapshot() })).toThrow(SessionStateError);
  });

  it('detaches supported rectangle snapshots before restore and capture', () => {
    const registry = new SessionStateRegistry();
    const restored: Rect[] = [];
    const dispose = registry.register(defineSessionState<Rect>('test.rectangle'), {
      restorePhase: SessionStateRestorePhase.BeforeInitialize,
      capture: () => void 0,
      restore: (value) => restored.push(value),
    });
    const input = new Rect([[1, 1], [2, 2]]);
    registry.loadSnapshot({ 'test.rectangle': input });
    registry.restorePhase(SessionStateRestorePhase.BeforeInitialize);
    input.addRow(0);
    restored[0].addRow(0);
    dispose();

    expect((registry.capture()['test.rectangle'] as Rect).getPoint(0)).toEqual([1, 1]);
  });

  it('rejects invalid definitions, phases, order, and duplicate registrations with stable errors', () => {
    expect(() => defineSessionState('  ')).toThrow(SessionStateError);
    try {
      defineSessionState('');
    } catch (error) {
      expect(error).toMatchObject({
        code: SessionStateErrorCode.invalidDefinition,
        details: { sessionStateId: '' },
      });
    }

    const registry = new SessionStateRegistry();
    expect(() => registry.restorePhase(SessionStateRestorePhase.BeforeInitialize)).toThrow(
      'A session state snapshot must be loaded before restore phases run.',
    );
    registry.loadSnapshot({});
    expect(() => registry.restorePhase(SessionStateRestorePhase.AfterInitialize)).toThrow(
      'Session state restore phase "afterInitialize" cannot run before "beforeInitialize".',
    );

    const definition = defineSessionState<number>('test.duplicate');
    registry.register(definition, {
      restorePhase: SessionStateRestorePhase.BeforeInitialize,
      capture: () => 1,
      restore: () => void 0,
    });
    expect(() =>
      registry.register(definition, {
        restorePhase: SessionStateRestorePhase.BeforeInitialize,
        capture: () => 2,
        restore: () => void 0,
      }),
    ).toThrow('Session state "test.duplicate" is already registered.');
    expect(() =>
      new SessionStateRegistry().register(defineSessionState('test.invalid-phase'), {
        restorePhase: 'invalid' as SessionStateRestorePhaseType,
        capture: () => null,
        restore: () => void 0,
      }),
    ).toThrow('Unsupported session state restore phase "invalid".');

    registry.restorePhase(SessionStateRestorePhase.BeforeInitialize);
    expect(() =>
      registry.register(defineSessionState('test.too-late'), {
        restorePhase: SessionStateRestorePhase.BeforeInitialize,
        capture: () => null,
        restore: () => void 0,
      }),
    ).toThrow('cannot register after restore phase "beforeInitialize" began');

    const reentrantRegistry = new SessionStateRegistry();
    reentrantRegistry.register(defineSessionState('test.reentrant'), {
      restorePhase: SessionStateRestorePhase.BeforeInitialize,
      capture: () => true,
      restore: () => reentrantRegistry.restorePhase(SessionStateRestorePhase.BeforeInitialize),
    });
    reentrantRegistry.loadSnapshot({ 'test.reentrant': true });
    expect(() => reentrantRegistry.restorePhase(SessionStateRestorePhase.BeforeInitialize)).toThrow(
      'restore phase "beforeInitialize" is already running',
    );
    expect(reentrantRegistry.getCompletedRestorePhases()).toEqual([]);

    const left = defineSessionState<number>('test.left');
    const right = defineSessionState<number>('test.right');
    const cyclicRegistry = new SessionStateRegistry();
    cyclicRegistry.register(left, {
      restorePhase: SessionStateRestorePhase.BeforeInitialize,
      restoreAfter: [right],
      capture: () => 1,
      restore: () => void 0,
    });
    cyclicRegistry.register(right, {
      restorePhase: SessionStateRestorePhase.BeforeInitialize,
      restoreAfter: [left],
      capture: () => 1,
      restore: () => void 0,
    });
    cyclicRegistry.loadSnapshot({ 'test.left': 1, 'test.right': 1 });
    expect(() => cyclicRegistry.restorePhase(SessionStateRestorePhase.BeforeInitialize)).toThrow(
      'Session state restore dependencies contain a cycle',
    );
  });
});
