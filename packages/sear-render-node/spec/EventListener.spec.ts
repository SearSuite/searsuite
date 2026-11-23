import { EventListener } from '../src';

type MyEvents = 'foo' | 'bar';

describe('EventListener', () => {
  let listener: EventListener<MyEvents>;

  beforeEach(() => {
    listener = new EventListener<MyEvents>();
  });

  test('should register and emit event handlers', () => {
    const handler = jest.fn();
    listener.on('foo', handler);

    listener.emit('foo', 123, 'abc');
    expect(handler).toHaveBeenCalledWith(123, 'abc');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('should support multiple handlers for the same event', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();
    listener.on('foo', handler1);
    listener.on('foo', handler2);

    listener.emit('foo', 1);
    expect(handler1).toHaveBeenCalledWith(1);
    expect(handler2).toHaveBeenCalledWith(1);
  });

  test('should remove handlers for a specific event', () => {
    const handler = jest.fn();
    listener.on('foo', handler);

    listener.off('foo');
    listener.emit('foo', 1);
    expect(handler).not.toHaveBeenCalled();
  });

  test('should remove all handlers when called without arguments', () => {
    const handlerFoo = jest.fn();
    const handlerBar = jest.fn();
    listener.on('foo', handlerFoo);
    listener.on('bar', handlerBar);

    listener.off();
    listener.emit('foo', 1);
    listener.emit('bar', 2);
    expect(handlerFoo).not.toHaveBeenCalled();
    expect(handlerBar).not.toHaveBeenCalled();
  });

  test('should chain on method', () => {
    const handler = jest.fn();
    const result = listener.on('foo', handler);
    expect(result).toBe(listener);
  });

  test('should stop propagation when handler returns false', () => {
    const handler1 = jest.fn().mockReturnValue(false);
    const handler2 = jest.fn();
    listener.on('foo', handler1);
    listener.on('foo', handler2);

    const result = listener.emit('foo');
    expect(handler1).toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  test('rejects registration after sealing despite a forged guard method', () => {
    Object.assign(listener, { assertWriteAllowed: () => void 0 });
    listener.enforceWriteBoundary(() => { throw new Error('command required'); }, {});

    expect(() => listener.on('foo', jest.fn())).toThrow('command required');
  });
});
