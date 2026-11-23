/**
 * Platform abstraction that narrows browser-specific APIs into injectable capabilities.
 *
 * Each platform (browser, Node, mini app, React Native, etc.) provides its own
 * implementation. Application code injects Platform through DI instead of
 * calling global APIs directly.
 *
 */
export type PlatformFrameRequestCallback = (time: number) => void;

/** Canonical event names understood by platform event adapters. */
export const PlatformEventName = {
  Click: 'click',
  MouseDown: 'mousedown',
  MouseMove: 'mousemove',
  MouseUp: 'mouseup',
} as const;

/** Event-routing options supported by host adapters. */
export interface PlatformEventListenerOptions {
  /** Receives propagated events before target handlers can consume them. */
  readonly capture?: boolean;
}

export interface PlatformViewOffset {
  readonly x: number;
  readonly y: number;
}

/**
 * Host services used by editor code without depending on one runtime's globals.
 *
 * An assembly receives a concrete implementation for frame scheduling,
 * clocks, events, view coordinates, resize observation, and diagnostics.
 * Web and non-Web hosts can provide these operations through the same
 * contract; visual rendering is configured separately.
 */
export abstract class Platform {
  /** DI token for resolving Platform. */
  public static readonly symbol: symbol = Symbol.for('Platform');

  /** Schedules a callback for the next host animation frame. */
  abstract requestAnimationFrame(callback: PlatformFrameRequestCallback): number;
  /** Cancels a previously scheduled host animation frame. */
  abstract cancelAnimationFrame(handle: number): void;
  /** Updates the timeout. */
  abstract setTimeout(callback: () => void, ms: number): number;
  /** Cancels a one-shot host timer. */
  abstract clearTimeout(handle: number): void;
  /** Updates the interval. */
  abstract setInterval(callback: () => void, ms: number): number;
  /** Cancels a repeating host timer. */
  abstract clearInterval(handle: number): void;
  /** Returns the host's monotonic time in milliseconds. */
  abstract now(): number;
  /** Returns the host wall-clock time as Unix milliseconds. */
  abstract currentDateTime(): number;
  /** Schedules a callback in the host microtask queue. */
  abstract queueMicrotask(callback: () => void): void;
  /** Reports a non-fatal platform warning. */
  abstract warn(message: string, ...details: unknown[]): void;
  /** Creates a process- or session-unique identifier for runtime protocols. */
  abstract createId(prefix?: string): string;
  /** Converts text to lowercase without consulting the host's locale. */
  toLowerCase(value: string): string {
    return value.toLowerCase();
  }
  /** Adds a platform event listener and returns its disposer. */
  abstract addEventListener(
    target: unknown,
    type: string,
    listener: (event: unknown) => void,
    options?: PlatformEventListenerOptions,
  ): () => void;
  /** Observes the CSS-pixel size of a platform render target. */
  abstract observeResize(target: unknown, callback: (size: { width: number; height: number }) => void): () => void;
  /** Reads a render target's offset in host view coordinates. */
  abstract readViewOffset(target: unknown): PlatformViewOffset;
}
