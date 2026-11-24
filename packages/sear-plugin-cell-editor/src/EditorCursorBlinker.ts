import { Platform } from '@searsuite/sear-foundation-platform';
import { CURSOR_BLINK_INTERVAL_MS } from './EditorTypes';

/**
 * Manages the cursor blink timer and visibility state for the cell editor.
 * Calls the provided `onTick` callback each time the blink phase toggles,
 * allowing the caller to schedule a rerender.
 */
export class EditorCursorBlinker {
  readonly #platform: Platform;
  readonly #onTick: () => void;

  #_visible: boolean = true;
  #timer: number | null = null;

  /** Creates a EditorCursorBlinker instance. */
  constructor(platform: Platform, onTick: () => void) {
    this.#platform = platform;
    this.#onTick = onTick;
  }

  /** Whether the cursor bar should be drawn in the current frame. */
  public get visible(): boolean {
    return this.#_visible;
  }

  /** Starts EditorCursorBlinker. */
  public start(): void {
    this.stop();
    this.#_visible = true;
    this.#timer = this.#platform.setInterval(this.#tickCursorBlink.bind(this), CURSOR_BLINK_INTERVAL_MS);
  }

  #tickCursorBlink(): void {
    this.#_visible = !this.#_visible;
    this.#onTick();
  }

  /** Stops the active cursor blink cycle and clears its timer. */
  public stop(): void {
    if (this.#timer !== null) {
      this.#platform.clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  /** Reset blink phase so cursor is immediately visible after a keystroke. */
  public reset(): void {
    this.stop();
    this.#_visible = true;
    this.start();
  }
}
