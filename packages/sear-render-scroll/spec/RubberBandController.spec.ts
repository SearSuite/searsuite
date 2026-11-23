import { type Platform } from '@searsuite/sear-foundation-platform';
import { RubberBandConfigError, RubberBandController, type RubberBandOffset, rubberBandDistance } from '../src';

interface PhysicsPlatform extends Platform {
  nowValue: number;
  readonly frames: Map<number, FrameRequestCallback>;
  readonly timers: Map<number, () => void>;
  runNextFrame(time: number): void;
  runNextTimer(): void;
}

function createPlatform(): PhysicsPlatform {
  let nextHandle = 1;
  return {
    nowValue: 0,
    frames: new Map(),
    timers: new Map(),
    requestAnimationFrame(callback: FrameRequestCallback): number {
      const handle = nextHandle++;
      this.frames.set(handle, callback);
      return handle;
    },
    cancelAnimationFrame(handle: number): void {
      this.frames.delete(handle);
    },
    setTimeout(callback: () => void, _ms: number): number {
      const handle = nextHandle++;
      this.timers.set(handle, callback);
      return handle;
    },
    clearTimeout(handle: number): void {
      this.timers.delete(handle);
    },
    setInterval: jest.fn(() => 1),
    clearInterval: jest.fn(),
    now(): number {
      return this.nowValue;
    },
    currentDateTime(): number {
      return 0;
    },
    queueMicrotask(callback: () => void): void {
      callback();
    },
    warn: jest.fn(),
    createId(prefix = 'test'): string {
      return `${prefix}-${nextHandle++}`;
    },
    toLowerCase(value: string): string {
      return value.toLowerCase();
    },
    addEventListener: jest.fn(() => jest.fn()),
    observeResize: jest.fn(() => jest.fn()),
    readViewOffset: jest.fn(() => ({ x: 0, y: 0 })),
    runNextFrame(time: number): void {
      const entry = this.frames.entries().next().value as [number, FrameRequestCallback] | undefined;
      if (!entry) throw new Error('Expected a queued animation frame.');
      this.frames.delete(entry[0]);
      entry[1](time);
    },
    runNextTimer(): void {
      const entry = this.timers.entries().next().value as [number, () => void] | undefined;
      if (!entry) throw new Error('Expected a queued timer.');
      this.timers.delete(entry[0]);
      entry[1]();
    },
  };
}

function consume(
  controller: RubberBandController,
  position: RubberBandOffset,
  displacement: RubberBandOffset,
  boundary: RubberBandOffset = { x: 100, y: 100 },
  viewport: RubberBandOffset = { x: 200, y: 100 },
): RubberBandOffset {
  return controller.consume({ position, boundary, viewport, displacement });
}

describe('RubberBandController', () => {
  it('uses a Safari-like resistance curve with a smooth displacement cap', () => {
    expect(rubberBandDistance(0, 100)).toBe(0);
    expect(rubberBandDistance(100, 100)).toBeCloseTo((30 * 100) / (100 + 30 / 0.55));
    expect(rubberBandDistance(100, 100)).toBeGreaterThan(100 * 0.1);
    expect(rubberBandDistance(100, 200)).toBeGreaterThan(rubberBandDistance(100, 100));
  });

  it('accumulates raw excess rather than feeding resisted pixels back into the curve', () => {
    const offsets: RubberBandOffset[] = [];
    const controller = new RubberBandController(createPlatform(), (offset) => offsets.push(offset));

    expect(consume(controller, { x: 0, y: 0 }, { x: 0, y: 30 })).toEqual({ x: 0, y: 0 });
    expect(consume(controller, { x: 0, y: 0 }, { x: 0, y: 30 })).toEqual({ x: 0, y: 0 });

    expect(offsets.at(-1)?.y).toBeCloseTo(rubberBandDistance(60, 100));
  });

  it('keeps resistance continuous instead of creating a hard displacement plateau', () => {
    const controller = new RubberBandController(createPlatform(), jest.fn());

    consume(controller, { x: 0, y: 0 }, { x: 0, y: 1_000 }, { x: 100, y: 100 }, { x: 200, y: 600 });

    expect(controller.getOffset().y).toBeCloseTo(rubberBandDistance(1_000, 600));
    expect(controller.getOffset().y).toBeLessThan(144);
  });

  it('scales wheel pulls across short and long distances without changing touch resistance', () => {
    const controller = new RubberBandController(createPlatform(), jest.fn());
    const sample = {
      position: { x: 0, y: 0 },
      boundary: { x: 100, y: 100 },
      viewport: { x: 200, y: 529 },
      displacement: { x: 0, y: 30 },
    } as const;

    controller.consume({ ...sample, source: 'wheel' });
    expect(controller.getOffset().y).toBeGreaterThan(1);
    expect(controller.getOffset().y).toBeLessThan(3);

    controller.reset();
    controller.consume({ ...sample, displacement: { x: 0, y: 745 }, source: 'wheel' });
    expect(controller.getOffset().y).toBeGreaterThan(30);
    expect(controller.getOffset().y).toBeLessThan(35);

    controller.reset();
    controller.consume({ ...sample, displacement: { x: 0, y: 18_625 }, source: 'wheel' });
    expect(controller.getOffset().y).toBeGreaterThan(700);

    controller.reset();
    controller.consume({ ...sample, source: 'touch' });
    expect(controller.getOffset().y).toBeCloseTo(rubberBandDistance(30, 529));
  });

  it('consumes excess on reversal before logical scrolling resumes', () => {
    const controller = new RubberBandController(createPlatform(), jest.fn());
    consume(controller, { x: 0, y: 0 }, { x: 0, y: 60 });

    expect(consume(controller, { x: 0, y: 0 }, { x: 0, y: -20 })).toEqual({ x: 0, y: 0 });
    expect(controller.getOffset().y).toBeGreaterThan(0);
    expect(consume(controller, { x: 0, y: 0 }, { x: 0, y: -50 })).toEqual({ x: 0, y: 10 });
    expect(controller.getOffset()).toEqual({ x: 0, y: 0 });
  });

  it('lets reverse wheel input scroll immediately while the visual offset returns', () => {
    const controller = new RubberBandController(createPlatform(), jest.fn());
    const input = {
      position: { x: 0, y: 0 },
      boundary: { x: 1_000, y: 1_000 },
      viewport: { x: 600, y: 600 },
      source: 'wheel' as const,
    };

    controller.consume({ ...input, displacement: { x: 0, y: 100_000 } });
    const pulledOffset = controller.getOffset().y;
    expect(controller.consume({ ...input, displacement: { x: 0, y: -100 } })).toEqual({ x: 0, y: 100 });
    expect(controller.getOffset().y).toBeCloseTo(pulledOffset * Math.exp(-100 / 600));
    expect(controller.consume({ ...input, position: { x: 0, y: 100 }, displacement: { x: 0, y: -100 } })).toEqual({
      x: 0,
      y: 200,
    });
    expect(controller.getOffset().y).toBeCloseTo(pulledOffset * Math.exp(-200 / 600));
  });

  it('keeps extreme wheel displacement finite when a return is interrupted', () => {
    const platform = createPlatform();
    const controller = new RubberBandController(platform, jest.fn());
    const input = {
      position: { x: 0, y: 0 },
      boundary: { x: 1_000, y: 1_000 },
      viewport: { x: 600, y: 600 },
      source: 'wheel' as const,
    };

    controller.consume({ ...input, displacement: { x: 0, y: Number.MAX_VALUE } });
    expect(Number.isFinite(controller.getOffset().y)).toBe(true);
    controller.release(0);
    platform.runNextFrame(16);
    controller.consume({ ...input, displacement: { x: 0, y: 100 } });
    expect(Number.isFinite(controller.getOffset().y)).toBe(true);
  });

  it('clamps both logical axes while preserving diagonal visual displacement', () => {
    const controller = new RubberBandController(createPlatform(), jest.fn());

    expect(consume(controller, { x: 100, y: 0 }, { x: -40, y: 30 })).toEqual({ x: 100, y: 0 });
    expect(controller.getOffset().x).toBeLessThan(0);
    expect(controller.getOffset().y).toBeGreaterThan(0);
  });

  it('returns to zero with a critically damped spring after input settles', () => {
    const platform = createPlatform();
    const offsets: RubberBandOffset[] = [];
    const controller = new RubberBandController(platform, (offset) => offsets.push(offset));
    consume(controller, { x: 0, y: 0 }, { x: 0, y: 80 });

    controller.release();
    expect(platform.timers.size).toBe(1);
    platform.runNextTimer();

    let time = 0;
    for (let frame = 0; frame < 240 && platform.frames.size > 0; frame += 1) {
      time += 16;
      platform.runNextFrame(time);
    }

    expect(platform.frames.size).toBe(0);
    expect(controller.getOffset()).toEqual({ x: 0, y: 0 });
    expect(offsets.at(-1)).toEqual({ x: 0, y: 0 });
    expect(offsets.every((offset, index) => index === 0 || offset.y <= offsets[index - 1].y)).toBe(true);
  });

  it('leaves the maximum displacement promptly without overshooting', () => {
    const platform = createPlatform();
    const controller = new RubberBandController(platform, jest.fn());
    consume(controller, { x: 0, y: 0 }, { x: 0, y: 10_000 }, { x: 100, y: 100 }, { x: 200, y: 600 });
    const maximumOffset = controller.getOffset().y;

    controller.release(0);
    let time = 0;
    for (let frame = 0; frame < 10; frame += 1) {
      time += 16;
      platform.runNextFrame(time);
    }

    expect(controller.getOffset().y).toBeGreaterThanOrEqual(0);
    expect(controller.getOffset().y).toBeLessThan(maximumOffset * 0.5);
  });

  it('leaves the peak on the first return frame', () => {
    const platform = createPlatform();
    const controller = new RubberBandController(platform, jest.fn());
    consume(controller, { x: 0, y: 0 }, { x: 0, y: 80 });
    const peak = controller.getOffset().y;

    controller.release(0);
    platform.runNextFrame(16);

    expect(controller.getOffset().y).toBeLessThan(peak * 0.9);
    expect(controller.getOffset().y).toBeGreaterThan(0);
  });

  it('starts wheel return immediately even after a large pull', () => {
    const platform = createPlatform();
    const controller = new RubberBandController(platform, jest.fn());
    const input = {
      position: { x: 0, y: 0 },
      boundary: { x: 100, y: 100 },
      viewport: { x: 200, y: 600 },
      source: 'wheel' as const,
    };

    controller.consume({ ...input, displacement: { x: 0, y: 30 } });
    controller.release(0);
    expect(platform.timers.size).toBe(0);
    expect(platform.frames.size).toBe(1);

    controller.reset();
    controller.consume({ ...input, displacement: { x: 0, y: 100_000 } });
    controller.release(0);
    expect(platform.timers.size).toBe(0);
    expect(platform.frames.size).toBe(1);
  });

  it('lets direct touch releases retain velocity while wheel-style releases return monotonically', () => {
    const wheelPlatform = createPlatform();
    const wheelController = new RubberBandController(wheelPlatform, jest.fn());
    consume(wheelController, { x: 0, y: 0 }, { x: 0, y: 80 });
    const wheelStart = wheelController.getOffset().y;
    wheelController.release(0);
    wheelPlatform.runNextFrame(16);
    expect(wheelController.getOffset().y).toBeLessThan(wheelStart);

    const touchPlatform = createPlatform();
    const touchController = new RubberBandController(touchPlatform, jest.fn());
    consume(touchController, { x: 0, y: 0 }, { x: 0, y: 80 });
    const touchStart = touchController.getOffset().y;
    touchController.release(0, true);
    touchPlatform.runNextFrame(16);
    expect(touchController.getOffset().y).toBeGreaterThan(touchStart);
  });

  it('can interrupt a return and continue from the current resisted position', () => {
    const platform = createPlatform();
    const controller = new RubberBandController(platform, jest.fn());
    consume(controller, { x: 0, y: 0 }, { x: 0, y: 80 });
    controller.release(0);
    platform.runNextFrame(16);
    const returningOffset = controller.getOffset().y;

    consume(controller, { x: 0, y: 0 }, { x: 0, y: 10 });

    expect(platform.frames.size).toBe(0);
    expect(controller.getOffset().y).toBeGreaterThan(returningOffset);
  });

  it('disables visual motion and rejects invalid public configuration', () => {
    const controller = new RubberBandController(createPlatform(), jest.fn());
    controller.configure({ enabled: false });

    expect(consume(controller, { x: 0, y: 0 }, { x: 20, y: 30 })).toEqual({ x: 0, y: 0 });
    expect(controller.getOffset()).toEqual({ x: 0, y: 0 });
    expect(() => controller.configure({ resistance: 0 })).toThrow(RubberBandConfigError);
    try {
      controller.configure({ springMass: -1 });
    } catch (error) {
      expect(error).toMatchObject({
        code: 'SEAR_SCROLL_INVALID_RUBBER_BAND_CONFIG',
        details: { config: expect.objectContaining({ springMass: -1 }) },
      });
    }
  });

  it('cancels pending timers and frames on reset', () => {
    const platform = createPlatform();
    const controller = new RubberBandController(platform, jest.fn());
    consume(controller, { x: 0, y: 0 }, { x: 0, y: 50 });
    controller.release();
    controller.reset();

    expect(platform.timers.size).toBe(0);
    expect(platform.frames.size).toBe(0);
    expect(controller.getOffset()).toEqual({ x: 0, y: 0 });
  });
});
