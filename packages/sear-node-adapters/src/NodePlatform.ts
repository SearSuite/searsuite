import { Injectable } from '@searsuite/sear-foundation-di';
import { Platform, type PlatformFrameRequestCallback, type PlatformViewOffset } from '@searsuite/sear-foundation-platform';

/** Platform adapter for Node environments without a UI surface. */
@Injectable()
export class NodePlatform extends Platform {
  /** DI token for resolving NodePlatform. */
  public static readonly symbol: symbol = Symbol.for('NodePlatform');

  private nextHandle = 1;
  private readonly timeouts = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly intervals = new Map<number, ReturnType<typeof setInterval>>();

  /** Schedules a callback for the next host animation frame. */
  public requestAnimationFrame(callback: PlatformFrameRequestCallback): number {
    const handle = this.nextHandle++;
    const platform = this;
    const timeout = setTimeout(function runNodeAnimationFrameCallback() {
      platform.timeouts.delete(handle);
      callback(platform.now());
    }, 0);
    this.timeouts.set(handle, timeout);
    return handle;
  }

  /** Cancels a previously scheduled host animation frame. */
  public cancelAnimationFrame(handle: number): void {
    this.clearTimeout(handle);
  }

  /** Updates the timeout. */
  public setTimeout(callback: () => void, ms: number): number {
    const handle = this.nextHandle++;
    const platform = this;
    const timeout = setTimeout(function runNodeTimeoutCallback() {
      platform.timeouts.delete(handle);
      callback();
    }, ms);
    this.timeouts.set(handle, timeout);
    return handle;
  }

  /** Cancels a one-shot host timer. */
  public clearTimeout(handle: number): void {
    const timeout = this.timeouts.get(handle);
    if (timeout === void 0) return;
    clearTimeout(timeout);
    this.timeouts.delete(handle);
  }

  /** Updates the interval. */
  public setInterval(callback: () => void, ms: number): number {
    const handle = this.nextHandle++;
    this.intervals.set(handle, setInterval(callback, ms));
    return handle;
  }

  /** Cancels a repeating host timer. */
  public clearInterval(handle: number): void {
    const interval = this.intervals.get(handle);
    if (interval === void 0) return;
    clearInterval(interval);
    this.intervals.delete(handle);
  }

  /** Returns the host's monotonic time in milliseconds. */
  public now(): number {
    return Date.now();
  }

  /** Returns the host wall-clock time as Unix milliseconds. */
  public currentDateTime(): number {
    return Date.now();
  }

  /** Schedules a callback in the host microtask queue. */
  public queueMicrotask(callback: () => void): void {
    Promise.resolve().then(callback);
  }

  /** Reports a non-fatal diagnostic through the host warning channel. */
  public warn(message: string, ...details: unknown[]): void {
    console.warn(message, ...details);
  }

  /** Creates a deterministic process-local runtime identifier. */
  public createId(prefix = 'node'): string {
    return `${prefix}-${this.nextHandle++}`;
  }

  /** Registers a host event listener and returns an idempotent disposer. */
  public addEventListener(_target: unknown, _type: string, _listener: (event: unknown) => void): () => void {
    return function removeNodeEventListener(): void {
      return void 0;
    };
  }

  /** Observes host-view size changes and returns an idempotent disposer. */
  public observeResize(_target: unknown, _callback: (size: { width: number; height: number }) => void): () => void {
    return function disconnectNodeResizeObserver(): void {
      return void 0;
    };
  }

  /** Headless targets have no host-space offset. */
  public readViewOffset(_target: unknown): PlatformViewOffset {
    return { x: 0, y: 0 };
  }
}
