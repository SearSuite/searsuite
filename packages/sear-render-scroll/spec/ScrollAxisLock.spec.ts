import { ScrollAxisLock, ScrollAxisLockConfigError } from '../src';

describe('ScrollAxisLock', () => {
  it('accumulates startup noise and locks to the first dominant axis', () => {
    const lock = new ScrollAxisLock();

    expect(lock.consume(0.4, 0.3)).toEqual({ x: 0, y: 0 });
    expect(lock.consume(0.7, 0.2)).toEqual({ x: 0, y: 0 });
    expect(lock.consume(0.8, 0.1).x).toBeCloseTo(1.9);
    expect(lock.getAxis()).toBe('x');
    expect(lock.consume(2, 40)).toEqual({ x: 2, y: 0 });
  });

  it('locks equal diagonal input to the vertical axis and resets between gestures', () => {
    const lock = new ScrollAxisLock();

    expect(lock.consume(4, 4)).toEqual({ x: 0, y: 4 });
    expect(lock.getAxis()).toBe('y');
    lock.reset();
    expect(lock.consume(5, 2)).toEqual({ x: 5, y: 0 });
  });

  it('can be disabled and exposes a configurable wheel gesture delay', () => {
    const lock = new ScrollAxisLock();
    lock.configure({ enabled: false, wheelEndDelay: 96 });

    expect(lock.consume(3, 7)).toEqual({ x: 3, y: 7 });
    expect(lock.getWheelEndDelay()).toBe(96);
  });

  it('rejects invalid public configuration with a stable error', () => {
    const lock = new ScrollAxisLock();

    expect(() => lock.configure({ activationThreshold: -1 })).toThrow(ScrollAxisLockConfigError);
    try {
      lock.configure({ wheelEndDelay: Number.NaN });
    } catch (error) {
      expect(error).toMatchObject({
        code: 'SEAR_SCROLL_INVALID_AXIS_LOCK_CONFIG',
        details: { config: expect.objectContaining({ wheelEndDelay: Number.NaN }) },
      });
    }
  });
});
