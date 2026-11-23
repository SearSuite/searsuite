import { TextInputKind, type TextInputEvent } from '@searsuite/sear-render-input';
import { DocInputBindingRegistry } from '../src/doc/DocInputBindingRegistry';

describe('DocInputBindingRegistry text stream', () => {
  it('forwards both text phases in order without altering the event', () => {
    const registry = new DocInputBindingRegistry();
    const first = jest.fn();
    const second = jest.fn();
    const onDelete = jest.fn();
    registry.registerTextHandlers({ onTextInput: first, onDelete });
    registry.registerTextHandlers({ onTextInput: second });
    const handlers = registry.createTextHandlers();
    const events: TextInputEvent[] = [
      { kind: TextInputKind.CompositionUpdate, text: 'zhong', caretOffset: 5 },
      { kind: TextInputKind.CompositionUpdate, text: '', caretOffset: 0 },
      { kind: TextInputKind.Text, text: 'Chinese' },
    ];
    events.forEach((event) => handlers.onTextInput?.(event));
    expect(first.mock.calls).toEqual(events.map((event) => [event]));
    expect(second.mock.calls).toEqual(first.mock.calls);
    expect(first.mock.calls[0][0]).toBe(events[0]);
    handlers.onDelete?.();
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('releases subscribers independently and clears all remaining bindings', () => {
    const registry = new DocInputBindingRegistry();
    const first = jest.fn();
    const second = jest.fn();
    const dispose = registry.registerTextHandlers({ onTextInput: first });
    registry.registerTextHandlers({ onTextInput: second });
    const handlers = registry.createTextHandlers();
    dispose();
    dispose();
    handlers.onTextInput?.({ kind: TextInputKind.Text, text: 'a' });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    registry.clear();
    handlers.onTextInput?.({ kind: TextInputKind.CompositionUpdate, text: 'b', caretOffset: 1 });
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('rejects retained binding writes outside commands after assembly', () => {
    const registry = new DocInputBindingRegistry();
    const original = jest.fn();
    const replacement = jest.fn();
    const handlers = { onDelete: original };
    const dispose = registry.registerTextHandlers(handlers);
    const dispatch = registry.createTextHandlers();
    let executing = false;
    let tearingDown = false;
    registry.enforceCommandBoundary(() => executing, () => tearingDown);

    handlers.onDelete = replacement;
    dispatch.onDelete?.();
    expect(original).toHaveBeenCalledTimes(1);
    expect(replacement).not.toHaveBeenCalled();
    expect(() => registry.registerTextHandlers({ onDelete: replacement })).toThrow('editor.commands.run');
    expect(() => dispose()).toThrow('editor.commands.run');
    expect(() => registry.clear()).toThrow('editor.commands.run');
    dispatch.onDelete?.();
    expect(original).toHaveBeenCalledTimes(2);

    executing = true;
    const disposeCommandBinding = registry.registerTextHandlers({ onDelete: replacement });
    executing = false;
    expect(() => disposeCommandBinding()).toThrow('editor.commands.run');
    tearingDown = true;
    dispose();
    registry.clear();
    disposeCommandBinding();
    expect(() => registry.registerTextHandlers({ onDelete: replacement })).toThrow('destroyed');
  });
});
