import { Injectable } from '@searsuite/sear-foundation-di';
import { PositionRect } from '@searsuite/sear-foundation-rect';
import { HexColor } from '@searsuite/sear-foundation-utils';
import { SearError } from '@searsuite/sear-foundation-error';

/** Scroll offset snapshot published to render and coordinate subscribers. */
export interface ScrollManagerState {
  /** Current horizontal scroll offset in world coordinates. */
  x: number;
  /** Current vertical scroll offset in world coordinates. */
  y: number;
  /** Horizontal input delta that produced the update. */
  deltaX: number;
  /** Vertical input delta that produced the update. */
  deltaY: number;
}

/** Callback notified whenever ScrollManager commits a new scroll state. */
export type ScrollSubscriber = (state: ScrollManagerState) => void;
/** Platform adapter that connects a scroll event source to ScrollManager. */
export type ScrollPublisher = (
  manager: ScrollManager,
  updateState: (newState: ScrollManagerState) => void,
) => () => void;

/** Creates the default zero-offset scroll state. */
export function createDefaultScrollManagerState(): ScrollManagerState {
  return {
    x: 0,
    y: 0,
    deltaX: 0,
    deltaY: 0,
  };
}

/** Owns viewport scroll state and fans updates out to render subscribers. */
@Injectable()
export class ScrollManager {
  /** DI token for resolving the scroll manager. */
  public static readonly symbol: symbol = Symbol.for('ScrollManager');

  #width: number;
  #height: number;
  #state: ScrollManagerState;
  #previousState: ScrollManagerState;
  #renderedState: ScrollManagerState;
  private isScrolling: boolean = false;

  /** Maximum scrollable position: contentWidth - viewportWidth, contentHeight - viewportHeight. */
  #contentBoundary: [number, number] = [0, 0];

  private scrollPublishers: (() => void)[] = [];
  private scrollSubscribers: ScrollSubscriber[] = [];
  #inputUpdateExecutor: ((state: ScrollManagerState) => void) | undefined;
  #scrollToExecutor: ((x: number, y: number) => void) | undefined;
  #commandBoundaryCheck: (() => boolean) | undefined;
  #teardownToken: object | undefined;
  #destroyed = false;

  /** Creates a scroll manager for a viewport of the given dimensions. */
  constructor(width: number, height: number) {
    this.#width = width;
    this.#height = height;

    this.#state = Object.freeze(createDefaultScrollManagerState());
    this.#previousState = this.#state;
    this.#renderedState = this.#state;
  }

  /** Closes direct viewport writes after the owning editor finishes restoration. */
  public enforceCommandBoundary(isExecuting: () => boolean): void {
    if (this.#commandBoundaryCheck) throw new SearError('Scroll command boundary is already installed.');
    this.#commandBoundaryCheck = isExecuting;
    Object.preventExtensions(this);
  }

  /** Reserves publisher cleanup for the owning editor. */
  public enforceTeardownBoundary(ownerToken: object): void {
    if (this.#teardownToken) throw new SearError('Scroll teardown boundary is already installed.');
    this.#teardownToken = ownerToken;
  }

  #assertCommandWrite(): void {
    if (this.#commandBoundaryCheck && !this.#commandBoundaryCheck()) {
      throw new SearError('Viewport changes must run through editor.commands.run(...).');
    }
  }

  private notifyScroll(): void {
    for (const callback of this.scrollSubscribers) {
      callback(this.#state);
    }
  }

  private update(newState: ScrollManagerState): void {
    this.#assertCommandWrite();
    const previousState = this.#state;

    // Clamp scroll position to content boundary so that getState()
    // always returns the actual clamped position.  This makes
    // ScrollManager the single source of truth — no consumer needs
    // to re-clamp or predict the position.
    //
    // When contentBoundary is [0, 0] (not yet configured), skip
    // clamping so that unit tests and early bootstrap work correctly.
    const [maxX, maxY] = this.#contentBoundary;
    const x = Math.min(Math.max(-newState.deltaX + previousState.x, 0), maxX || Infinity);
    const y = Math.min(Math.max(-newState.deltaY + previousState.y, 0), maxY || Infinity);

    // Wheel events continue firing at a scroll boundary.  Nothing in the
    // scene changes when clamping keeps both coordinates unchanged, so do
    // not wake render, hit-test, or viewport-culling subscribers.
    if (x === previousState.x && y === previousState.y) return;

    this.#previousState = previousState;
    this.#state = Object.freeze({ ...newState, x, y });
    this.notifyScroll();
  }

  // public getIsScrolling(): boolean {
  //     return this.isScrolling;
  // }

  /** Returns the previous committed scroll state. */
  public getPreviousState(): ScrollManagerState | null {
    return this.#previousState;
  }

  /** Returns the viewport dimensions as `[width, height]`. */
  public getShape(): [number, number] {
    return [this.#width, this.#height];
  }

  /** Returns the maximum logical scroll positions for platform adapters. */
  public getContentBoundary(): [number, number] {
    return [...this.#contentBoundary];
  }

  /** Updates viewport dimensions and clamps the current position without emitting a scroll render. */
  public resize(width: number, height: number): void {
    this.#assertCommandWrite();
    this.#width = width;
    this.#height = height;

    const [maxX, maxY] = this.#contentBoundary;
    this.#previousState = this.#state;
    this.#state = Object.freeze({
      ...this.#state,
      x: Math.min(this.#state.x, maxX || Infinity),
      y: Math.min(this.#state.y, maxY || Infinity),
      deltaX: 0,
      deltaY: 0,
    });
  }

  // public getBoundary(): [number, number] {
  //     return [this.widthBoundary, this.heightBoundary];
  // }

  /** Returns the current committed scroll state. */
  public getState(): ScrollManagerState {
    return this.#state;
  }

  /**
   * Returns the scroll state that render strategies should use for viewport
   * copy planning.
   *
   * `deltaX` and `deltaY` are computed from the last position marked as
   * rendered to the current committed position. This keeps wheel scrolling and
   * programmatic `scrollTo()` jumps on the same delta convention expected by
   * `RasterCopyPlan`: previous minus current.
   */
  public getRenderScrollState(): ScrollManagerState {
    return {
      ...this.#state,
      deltaX: this.#renderedState.x - this.#state.x,
      deltaY: this.#renderedState.y - this.#state.y,
    };
  }

  /** Returns whether the current scroll position has not yet been rendered. */
  public hasUnrenderedScroll(): boolean {
    const renderState = this.getRenderScrollState();
    return renderState.deltaX !== 0 || renderState.deltaY !== 0;
  }

  /** Marks the current committed scroll position as consumed by a render frame. */
  public markScrollStateRendered(): void {
    this.#renderedState = {
      ...this.#state,
      deltaX: 0,
      deltaY: 0,
    };
  }

  /** Routes platform-originated viewport input through the host's action boundary. */
  public setInputUpdateExecutor(executor: (state: ScrollManagerState) => void): void {
    if (this.#inputUpdateExecutor || this.#commandBoundaryCheck) {
      throw new SearError('Scroll input executor is already owned by an editor.');
    }
    this.#inputUpdateExecutor = executor;
  }

  /** Applies platform scroll data within the owning editor's command. */
  public applyInputScroll(state: ScrollManagerState): void {
    const { x, y, deltaX, deltaY } = state;
    if (![x, y, deltaX, deltaY].every(Number.isFinite)) {
      throw new SearError('Scroll input requires finite coordinates and deltas.');
    }
    this.update({ x, y, deltaX, deltaY });
  }

  /** Binds programmatic scroll requests to the owning editor's command bus. */
  public setScrollToExecutor(executor: (x: number, y: number) => void): void {
    if (this.#scrollToExecutor || this.#commandBoundaryCheck) {
      throw new SearError('Scroll request executor is already owned by an editor.');
    }
    this.#scrollToExecutor = executor;
  }

  /** Requests an absolute scroll position through the owning editor. */
  public requestScrollTo(x: number, y: number): void {
    if (this.#scrollToExecutor) this.#scrollToExecutor(x, y);
    else this.scrollTo(x, y);
  }

  /**
   * Directly set the scroll position (x, y) in the manager's state.
   *
   * Useful for programmatic scroll jumps (e.g. "scroll to cell A1").
   * For normal scroll events, use addPublisher + update() instead,
   * which clamps the position to the content boundary.
   */
  public setPosition(x: number, y: number): void {
    this.#assertCommandWrite();
    this.#state = Object.freeze({ ...this.#state, x, y });
  }

  /**
   * Programmatically scroll to an absolute position, clamped to the content
   * boundary, and notify all subscribers so the render pipeline re-draws.
   */
  public scrollTo(x: number, y: number): void {
    this.#assertCommandWrite();
    const [maxX, maxY] = this.#contentBoundary;
    const clampedX = Math.min(Math.max(x, 0), maxX || Infinity);
    const clampedY = Math.min(Math.max(y, 0), maxY || Infinity);
    if (clampedX === this.#state.x && clampedY === this.#state.y) return;
    this.#previousState = this.#state;
    this.#state = Object.freeze({
      ...this.#state,
      x: clampedX,
      y: clampedY,
      deltaX: this.#state.x - clampedX,
      deltaY: this.#state.y - clampedY,
    });
    this.notifyScroll();
  }

  /**
   * Set the content boundary for scroll clamping.
   *
   * @param maxWidth  Maximum scrollable x position (contentWidth - viewportWidth)
   * @param maxHeight Maximum scrollable y position (contentHeight - viewportHeight)
   *
   * This should be called after initialization once the total sheet dimensions
   * are known (e.g. by expandTreeBoundaryToSheetSize).
   */
  public setContentBoundary(maxWidth: number, maxHeight: number): void {
    this.#assertCommandWrite();
    this.#contentBoundary = [maxWidth, maxHeight];
    this.#state = Object.freeze({
      ...this.#state,
      x: Math.min(this.#state.x, maxWidth || Infinity),
      y: Math.min(this.#state.y, maxHeight || Infinity),
      deltaX: 0,
      deltaY: 0,
    });
  }

  /**
   * Returns the viewport rectangle as (0, 0, width, height).
   *
   * The scroll position is NOT included in the returned rect.
   * Consumers that need the world-coordinate viewport should construct
   * their own rect using scrollState.x/y (available via getState()).
   *
   * Historically this method returned (state.x, state.y, width, height),
   * but since ScrollManager.update() now clamps state.x/y in-place,
   * including them caused double-offset bugs in render strategies that
   * already add scrollState.x/y to compute world-coordinate query rects.
   */
  public getPositionRect(): PositionRect<HexColor> {
    return new PositionRect(0, 0, this.#width, this.#height);
  }

  /** Connects a scroll-event source and returns an idempotent disposer. */
  public addPublisher(publisher: ScrollPublisher): () => void {
    const manager = this;
    function updateScrollStateFromPublisher(newState: ScrollManagerState): void {
      if (manager.#inputUpdateExecutor) manager.#inputUpdateExecutor({ ...newState });
      else manager.update(newState);
    }
    const cleanup = publisher(this, updateScrollStateFromPublisher);
    this.scrollPublishers.push(cleanup);
    return function removeScrollPublisher(): void {
      if (!manager.scrollPublishers.includes(cleanup)) return;
      manager.scrollPublishers = manager.scrollPublishers.filter((item) => item !== cleanup);
      cleanup();
    };
  }

  /**
   * Subscribes to scroll-state changes and returns an idempotent disposer.
   * `prepend` is reserved for updates that must run before render strategies.
   */
  public subscribeScroll(callback: ScrollSubscriber, prepend: boolean = false): () => void {
    if (prepend) {
      this.scrollSubscribers.unshift(callback);
    } else {
      this.scrollSubscribers.push(callback);
    }
    const manager = this;
    return function unsubscribeScroll(): void {
      const index = manager.scrollSubscribers.indexOf(callback);
      if (index === -1) return;
      manager.scrollSubscribers.splice(index, 1);
    };
  }

  /** Disconnects publishers and subscribers owned by this manager. */
  public destroy(ownerToken?: object): void {
    if (this.#destroyed) return;
    if (this.#teardownToken && ownerToken !== this.#teardownToken) {
      throw new SearError('Scroll cleanup requires its editor owner.');
    }
    this.#destroyed = true;
    const publishers = this.scrollPublishers;
    this.scrollPublishers = [];
    publishers.forEach((cleanup) => cleanup());
    this.scrollSubscribers = [];
  }
}
