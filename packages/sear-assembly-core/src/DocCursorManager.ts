import { Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';

/** Pre-computed pixel cursor state set by document layout before each render. */
export interface CursorRenderInfo {
  /** Absolute canvas X for the committed text caret. */
  x: number;
  /** Absolute canvas Y for the laid-out line that owns the cursor. */
  y: number;
  /** Line height in pixels (used to size the cursor bar). */
  height: number;
  /** Whether the cursor bar is currently visible (blink phase). */
  visible: boolean;
}

/** A single selection highlight rectangle in canvas coordinates. */
export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Injectable singleton that bridges document input state and render-node drawing.
 *
 * - The plugin computes pixel cursor coordinates (via DocLayoutEngine) and
 *   calls `setCursor()` before triggering a rerender.
 * - Document overlay render nodes read `getCursor()` and draw the cursor bar if set.
 * - clearCursor() is called on edit-session end so stale state is never drawn.
 */
@Injectable()
export class DocCursorManager {
  /** DI token for resolving DocCursorManager. */
  public static readonly symbol: symbol = Symbol.for('DocCursorManager');

  #info: CursorRenderInfo | null = null;
  #selectionRects: SelectionRect[] = [];
  #isCommandExecuting: (() => boolean) | null = null;
  #teardownToken: object | null = null;

  /** Seals assembled cursor writes while preserving command-owned rendering. */
  public enforceCommandBoundary(isCommandExecuting: () => boolean, teardownToken: object): void {
    if (this.#isCommandExecuting) throw new SearError('Doc cursor command boundary is already installed.');
    this.#info = this.#info ? Object.freeze({ ...this.#info }) : null;
    this.#selectionRects = Object.freeze(this.#selectionRects.map((rect) => Object.freeze({ ...rect }))) as SelectionRect[];
    this.#isCommandExecuting = isCommandExecuting;
    this.#teardownToken = teardownToken;
    Object.freeze(this);
  }

  #assertWritable(teardownToken?: object): void {
    if (this.#isCommandExecuting && teardownToken !== this.#teardownToken && !this.#isCommandExecuting()) {
      throw new SearError('Doc cursor changes must run through editor.commands.run(...).');
    }
  }

  /** Set (or update) the cursor render info for the upcoming draw call. */
  public setCursor(info: CursorRenderInfo): void {
    this.#assertWritable();
    this.#info = this.#isCommandExecuting ? Object.freeze({ ...info }) : info;
  }

  /** Read the cursor render info. Returns null when no edit session is active. */
  public getCursor(): CursorRenderInfo | null {
    return this.#info;
  }

  /** Set selection highlight rectangles for the upcoming draw call. */
  public setSelectionRects(rects: SelectionRect[]): void {
    this.#assertWritable();
    this.#selectionRects = this.#isCommandExecuting
      ? Object.freeze(rects.map((rect) => Object.freeze({ ...rect }))) as SelectionRect[]
      : rects;
  }

  /** Read the selection highlight rectangles. */
  public getSelectionRects(): SelectionRect[] {
    return this.#selectionRects;
  }

  /** Clear cursor and selection state (call on edit-session end). */
  public clearCursor(teardownToken?: object): void {
    this.#assertWritable(teardownToken);
    this.#info = null;
    this.#selectionRects = this.#isCommandExecuting
      ? Object.freeze([] as SelectionRect[]) as unknown as SelectionRect[]
      : [];
  }
}
