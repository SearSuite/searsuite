import { EventRegistrar, HeadlessEventRegistrar, normalizeEventKey, getViewHandlerName } from '../src';

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

    expect(getViewHandlerName('mousedown')).toBe('onMouseDown');
    expect(getViewHandlerName('mouseDown')).toBe('onMouseDown');
    expect(getViewHandlerName('mousemove')).toBe('onMouseMove');
    expect(getViewHandlerName('dblclick')).toBe('onDblClick');

    const registrar = new HeadlessEventRegistrar();
    registrar.register('mousedown');
    expect(registrar.registeredEvents).toEqual(['mouseDown']);
  });
});
