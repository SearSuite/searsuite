import { type Transaction } from '@searsuite/sear-domain-transaction';
import { MatrixTransactionOT } from '@searsuite/sear-domain-ot';

import { Plugin, PluginKey, PluginManager, type PluginDocumentStateContribution } from '../src';

interface MockState {
  value: number;
}

class MockPlugin extends Plugin<MockState> {
  public readonly applyMock = jest.fn();

  public apply(state: MockState, transaction: Transaction): MockState {
    this.applyMock(state, transaction);
    return state;
  }

  public registerState() {
    return { key: this.key, state: this.getState() };
  }
}

class StateOnlyMockPlugin extends MockPlugin {
  public readonly warnOnDuplicateDepth = false;
}

class CollaborativeMockPlugin extends StateOnlyMockPlugin {
  public override readonly transactionOT = {
    ownerId: 'mock.collaborative',
    definition: MatrixTransactionOT,
    collaborative: true,
  };
}

class ExportedCollaborativeMockPlugin extends CollaborativeMockPlugin {
  public override readonly documentState: PluginDocumentStateContribution<MockState, { value: number }> = {
    key: 'mock.value',
    capture: (state) => ({ value: state.value }),
    codec: {
      key: 'mock.value',
      serialize: (state) => state.value,
      deserialize: (payload) => ({ value: Number(payload) }),
    },
  };
}

describe('PluginManager', () => {
  const platform = { warn: jest.fn() };

  beforeEach(() => {
    platform.warn.mockClear();
  });

  it('registers plugins and exposes their state', () => {
    const manager = new PluginManager();
    const plugin = new MockPlugin({
      key: new PluginKey('state'),
      state: { value: 1 },
    });

    manager.registerPlugin(plugin);

    expect(manager.getPluginState<MockState>(plugin.key)).toEqual({ value: 1 });
    expect(manager.getPluginState(new PluginKey('missing'))).toBe(void 0);
  });

  it('rejects duplicate keys and can clear registered plugins', () => {
    const manager = new PluginManager();
    const plugin = new MockPlugin({
      key: new PluginKey('duplicate'),
      state: { value: 1 },
    });
    manager.registerPlugin(plugin);

    expect(() => manager.registerPlugin(plugin)).toThrow(`Plugin with key ${plugin.key.key} already exists.`);

    manager.clearPlugins();
    expect(manager.getAllPlugins()).toEqual([]);
    expect(plugin.getState()).toBe(void 0);
  });

  it('rejects duplicate plugin key strings', () => {
    const manager = new PluginManager();
    const firstKey = new PluginKey('same');
    const secondKey = Object.assign(Object.create(PluginKey.prototype), { key: firstKey.key }) as PluginKey;
    const first = new MockPlugin({ key: firstKey, state: { value: 1 } });
    const second = new MockPlugin({ key: secondKey, state: { value: 2 } });

    manager.registerPlugin(first);

    expect(() => manager.registerPlugin(second)).toThrow(`Plugin with key ${first.key.key} already exists.`);
  });

  it('unregisters plugins and clears their state', () => {
    const manager = new PluginManager();
    const plugin = new MockPlugin({
      key: new PluginKey('removable'),
      state: { value: 1 },
    });

    manager.registerPlugin(plugin);
    manager.unregisterPlugin(plugin.key);

    expect(manager.getAllPlugins()).toEqual([]);
    expect(manager.getPluginState(plugin.key)).toBe(void 0);
    expect(plugin.getState()).toBe(void 0);
  });

  it('rejects registry changes outside command dispatch after assembly', () => {
    const manager = new PluginManager();
    const plugin = new MockPlugin({ key: new PluginKey('guarded'), state: { value: 1 } });
    manager.registerPlugin(plugin);
    const token = {};
    manager.enforceWriteBoundary(token);

    expect(() => manager.registerPlugin(new MockPlugin({ key: new PluginKey('later'), state: { value: 2 } }))).toThrow(
      'require the owning runtime',
    );
    expect(() => manager.unregisterPlugin(plugin.key)).toThrow('require the owning runtime');
    expect(() => manager.clearPlugins()).toThrow('require the owning runtime');
    expect(manager.getAllPlugins()).toEqual([plugin]);

    manager.unregisterPlugin(plugin.key, token);
    expect(manager.getAllPlugins()).toEqual([]);
  });

  it('rejects a plugin instance already owned by another editor', () => {
    const plugin = new MockPlugin({ key: new PluginKey('shared'), state: { value: 1 } });
    plugin.enforceStateWriteBoundary({});
    Object.assign(plugin, { hasStateWriteBoundary: () => false });

    expect(() => new PluginManager().registerPlugin(plugin)).toThrow('already owned by another editor');
  });

  it('does not assign visual depth to business owners', () => {
    const manager = new PluginManager(platform as never);
    const first = new MockPlugin({ key: new PluginKey('first-depth'), state: { value: 1 } });
    const second = new MockPlugin({ key: new PluginKey('second-depth'), state: { value: 2 } });

    manager.registerPlugin(first);
    manager.registerPlugin(second);

    expect(platform.warn).not.toHaveBeenCalled();
  });

  it('does not warn when state-only plugins opt out of duplicate depth diagnostics', () => {
    const manager = new PluginManager(platform as never);
    const ordered = new MockPlugin({ key: new PluginKey('ordered-depth'), state: { value: 1 } });
    const stateOnly = new StateOnlyMockPlugin({ key: new PluginKey('state-depth'), state: { value: 2 } });

    manager.registerPlugin(ordered);
    manager.registerPlugin(stateOnly);

    expect(platform.warn).not.toHaveBeenCalled();
  });

  it('warns when a collaborative plugin does not register a document-state export contribution', () => {
    const manager = new PluginManager(platform as never);
    const plugin = new CollaborativeMockPlugin({ key: new PluginKey('collab-without-export'), state: { value: 1 } });

    manager.registerPlugin(plugin);

    expect(platform.warn).toHaveBeenCalledWith(
      expect.stringContaining('has no sear-plugin-export document-state contribution'),
    );
  });

  it('does not warn for collaboration when the plugin registers a document-state export contribution', () => {
    const manager = new PluginManager(platform as never);
    const plugin = new ExportedCollaborativeMockPlugin({
      key: new PluginKey('collab-with-export'),
      state: { value: 1 },
    });

    manager.registerPlugin(plugin);

    expect(platform.warn).not.toHaveBeenCalled();
    expect(manager.getDocumentStateContributions()).toHaveLength(1);
  });

  it('iterates business owners in registration order', () => {
    const manager = new PluginManager();
    const first = new MockPlugin({
      key: new PluginKey('first'),
      state: { value: 1 },
    });
    const second = new MockPlugin({
      key: new PluginKey('second'),
      state: { value: 2 },
    });
    const third = new MockPlugin({
      key: new PluginKey('third'),
      state: { value: 3 },
    });
    Object.defineProperty(first, 'depth', { value: 2 });
    Object.defineProperty(second, 'depth', { value: 1 });
    Object.defineProperty(third, 'depth', { value: undefined });
    manager.registerPlugin(first);
    manager.registerPlugin(second);
    manager.registerPlugin(third);
    const visited: Plugin<unknown>[] = [];

    manager.forEach((plugin) => visited.push(plugin));

    expect(visited).toEqual([first, second, third]);
  });

  it('covers depth sorting with multiple undefined depths', () => {
    const manager = new PluginManager();
    const a = new MockPlugin({ key: new PluginKey('a'), state: { value: 1 } });
    const b = new MockPlugin({ key: new PluginKey('b'), state: { value: 2 } });
    Object.defineProperty(a, 'depth', { value: undefined });
    Object.defineProperty(b, 'depth', { value: undefined });
    manager.registerPlugin(a);
    manager.registerPlugin(b);

    const visited: any[] = [];
    manager.forEach((p) => visited.push(p));
    expect(visited.length).toBe(2);
  });
});
