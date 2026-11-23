/** Pointer position normalized to the editor render root's view coordinates. */
export interface PointerCapturePoint {
  readonly view: {
    readonly x: number;
    readonly y: number;
  };
}

/** Callbacks active for one host-wide pointer capture session. */
export interface PointerCaptureHandlers {
  /** Receives pointer movement while capture is active. */
  readonly onMove?: (event: PointerCapturePoint) => void;
  /** Receives the release that ends the capture session. */
  readonly onRelease: (event: PointerCapturePoint) => void;
}

/** Platform-neutral, editor-local host-wide pointer capture contract. */
export abstract class PointerCapture {
  /** DI token for resolving the pointer capture adapter. */
  public static readonly symbol: symbol = Symbol.for('PointerCapture');

  /** Starts one capture session and returns a disposer for that session. */
  abstract start(handlers: PointerCaptureHandlers): () => void;

  /** Stops the active session without invoking its release callback. */
  abstract stop(): void;
}
