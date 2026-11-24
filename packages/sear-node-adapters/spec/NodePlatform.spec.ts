/** @jest-environment node */

import { NodePlatform } from '../src';

describe('NodePlatform', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('schedules and cancels frame, timeout and interval handles independently', () => {
    jest.useFakeTimers();
    const platform = new NodePlatform();
    const frame = jest.fn();
    const timeout = jest.fn();
    const interval = jest.fn();

    const cancelledFrame = platform.requestAnimationFrame(frame);
    platform.cancelAnimationFrame(cancelledFrame);
    platform.requestAnimationFrame(frame);
    const cancelledTimeout = platform.setTimeout(timeout, 10);
    platform.clearTimeout(cancelledTimeout);
    platform.setTimeout(timeout, 10);
    const intervalHandle = platform.setInterval(interval, 5);

    jest.advanceTimersByTime(10);

    expect(frame).toHaveBeenCalledTimes(1);
    expect(timeout).toHaveBeenCalledTimes(1);
    expect(interval).toHaveBeenCalledTimes(2);
    platform.clearInterval(intervalHandle);
    platform.clearTimeout(999);
    platform.clearInterval(999);
    jest.advanceTimersByTime(20);
    expect(interval).toHaveBeenCalledTimes(2);
  });

  it('provides portable queueing, warning and no-op resize observation', async () => {
    const platform = new NodePlatform();
    const callback = jest.fn();
    const warn = jest.spyOn(console, 'warn').mockImplementation();

    platform.queueMicrotask(callback);
    await Promise.resolve();
    platform.warn('diagnostic', { value: 1 });
    const unobserve = platform.observeResize({}, callback);
    unobserve();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('diagnostic', { value: 1 });
    warn.mockRestore();
  });
});
