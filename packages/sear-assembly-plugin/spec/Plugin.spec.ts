import { type NodeProperties } from '@searsuite/sear-render-node';
import { type Transaction } from '@searsuite/sear-domain-transaction';

import { Plugin, PluginKey } from '../src';

class MockPlugin extends Plugin<object, NodeProperties, { enabled: boolean }> {
  public apply(state: { enabled: boolean }, _transaction: Transaction) {
    return { ...state };
  }

  public render() {
    return null;
  }

  public getPluginConfig() {
    return {};
  }

  public registerState() {
    return { key: this.key, state: this.getState() };
  }
}

describe('Plugin', () => {
  it('retains its key and state', () => {
    const state = { enabled: true };
    const plugin = new MockPlugin({ key: new PluginKey('mock'), state });

    expect(plugin.key).toBeInstanceOf(PluginKey);
    expect(plugin.getState()).toBe(state);

    plugin.setState({ enabled: false });
    expect(plugin.getState()).toEqual({ enabled: false });
  });
});
