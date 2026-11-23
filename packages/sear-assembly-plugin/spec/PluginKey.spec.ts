import { PluginKey } from '../src';

describe('', () => {
  it('PluginKey should have a default key without props', () => {
    const pluginKey$ = new PluginKey();
    expect(pluginKey$.key).toBe('plugin$');

    const pluginKey$1 = new PluginKey();
    expect(pluginKey$1.key).toEqual('plugin$1');
  });

  it('PluginKey should support generate key by props string', () => {
    const pluginKey = new PluginKey('props');
    expect(pluginKey.key).toBe('props$');
  });

  it('PluginKey should create a unique key for each instance', () => {
    const key1 = new PluginKey('increment');
    const key2 = new PluginKey('increment');
    const key3 = new PluginKey('increment');

    expect(key1.key).toBe('increment$');
    expect(key2.key).toBe('increment$1');
    expect(key3.key).toBe('increment$2');
  });

  it('keeps a registered owner identity immutable through retained key handles', () => {
    const key = new PluginKey('immutable');
    expect(() => { (key as { key: string }).key = 'forged'; }).toThrow();
    expect(key.key).toBe('immutable$');
  });
});
