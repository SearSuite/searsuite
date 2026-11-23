import {
  EventRegistrar,
  HeadlessEventRegistrar,
  normalizeEventKey,
  getPluginHandlerName,
} from '../src';

describe('EventRegistrar', () => {
  it('registers each event once and unregisters it cleanly', () => {
    const registrar = new HeadlessEventRegistrar();

    registrar.register('click');
    registrar.register('click');
    registrar.register('mouseDown');
    registrar.unregister('click');
    registrar.unregister('missing');

    expect(registrar.registeredEvents).toEqual(['mouseDown']);
    expect(registrar).toBeInstanceOf(EventRegistrar);
  });

  it('normalizes event keys and derives plugin handler names regardless of input casing', () => {
    expect(normalizeEventKey('mousedown')).toBe('mouseDown');
    expect(normalizeEventKey('mouseDown')).toBe('mouseDown');
    expect(normalizeEventKey('mousemove')).toBe('mouseMove');
    expect(normalizeEventKey('dblclick')).toBe('dblClick');

    expect(getPluginHandlerName('mousedown')).toBe('onMouseDown');
    expect(getPluginHandlerName('mouseDown')).toBe('onMouseDown');
    expect(getPluginHandlerName('mousemove')).toBe('onMouseMove');
    expect(getPluginHandlerName('dblclick')).toBe('onDblClick');

    const registrar = new HeadlessEventRegistrar();
    registrar.register('mousedown');
    expect(registrar.registeredEvents).toEqual(['mouseDown']);
  });
});
