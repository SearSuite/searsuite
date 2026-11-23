import { SheetEmbeddedEditorPluginRegistry, type SheetEmbeddedEditorPlugin } from '../src';

describe('SheetEmbeddedEditorPluginRegistry', () => {
  it('keeps registered callbacks and keys stable after a plugin owner changes its object', () => {
    const registry = new SheetEmbeddedEditorPluginRegistry();
    const original = jest.fn((input) => input);
    const replacement = jest.fn((input) => input);
    const plugin: SheetEmbeddedEditorPlugin & { key: string; transformInput: typeof original } = {
      key: 'test.embedded',
      transformInput: original,
    };
    registry.register(plugin);

    plugin.key = 'test.changed';
    plugin.transformInput = replacement;
    expect(registry.get('test.embedded')?.key).toBe('test.embedded');
    expect(registry.get('test.changed')).toBeUndefined();
    const input = { type: 'insertText' as const, text: 'A' };
    registry.transformInput(input, {} as never);
    expect(original).toHaveBeenCalledWith(input, {});
    expect(replacement).not.toHaveBeenCalled();
    expect(Object.isFrozen(registry.get('test.embedded'))).toBe(true);
  });

  it('requires command scope for registration changes and reserves teardown for its owner', () => {
    const registry = new SheetEmbeddedEditorPluginRegistry();
    const disposed = jest.fn();
    registry.register({ key: 'test.embedded', dispose: disposed });
    let executing = false;
    const teardownToken = {};
    registry.enforceWriteBoundary(() => {
      if (!executing) throw new Error('command required');
    }, teardownToken);

    expect(() => registry.register({ key: 'test.other' })).toThrow('command required');
    expect(() => registry.unregister('test.embedded')).toThrow('command required');
    expect(() => registry.transformInput({ type: 'insertText', text: 'A' }, {} as never))
      .toThrow('command required');
    expect(() => registry.transformCommit([], {} as never)).toThrow('command required');
    expect(() => registry.notifyCancel({} as never)).toThrow('command required');
    expect(() => registry.dispose()).toThrow('command required');
    executing = true;
    registry.register({ key: 'test.other' });
    registry.unregister('test.other');
    executing = false;
    registry.dispose(teardownToken);
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(registry.getAll()).toEqual([]);
  });
});
