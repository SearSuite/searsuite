import { EditorCursorBlinker } from '../src/EditorCursorBlinker';
import { Platform } from '@searsuite/sear-foundation-platform';

describe('EditorCursorBlinker', () => {
  let platform: jest.Mocked<Platform>;
  let onTick: jest.Mock;

  beforeEach(() => {
    platform = {
      setInterval: jest.fn(),
      clearInterval: jest.fn(),
    } as unknown as jest.Mocked<Platform>;
    onTick = jest.fn();
  });

  it('manages cursor blink state', () => {
    const blinker = new EditorCursorBlinker(platform, onTick);

    // Initial state
    expect(blinker.visible).toBe(true);

    // Start blinking
    platform.setInterval.mockReturnValueOnce(123 as any);
    blinker.start();
    expect(blinker.visible).toBe(true);
    expect(platform.setInterval).toHaveBeenCalledTimes(1);

    // Simulate tick
    const tickCallback = platform.setInterval.mock.calls[0][0] as () => void;
    expect(tickCallback.name).toContain('tickCursorBlink');
    tickCallback();
    expect(blinker.visible).toBe(false);
    expect(onTick).toHaveBeenCalledTimes(1);

    tickCallback();
    expect(blinker.visible).toBe(true);
    expect(onTick).toHaveBeenCalledTimes(2);

    // Reset
    platform.setInterval.mockReturnValueOnce(456 as any);
    blinker.reset();
    expect(platform.clearInterval).toHaveBeenCalledWith(123);
    expect(blinker.visible).toBe(true);
    expect(platform.setInterval).toHaveBeenCalledTimes(2);

    // Stop
    blinker.stop();
    expect(platform.clearInterval).toHaveBeenCalledWith(456);

    // Stop again shouldn't do anything
    platform.clearInterval.mockClear();
    blinker.stop();
    expect(platform.clearInterval).not.toHaveBeenCalled();
  });
});
