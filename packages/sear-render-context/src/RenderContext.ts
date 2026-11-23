/** Semantic ownership metadata attached to drawing for retained targets and diagnostics. */
export interface RenderNodeSemantics {
  /** Plugin or scene owner responsible for the drawn node. */
  readonly owner?: string | undefined;
  /** Semantic role of the drawn node, such as cell, header or overlay. */
  readonly role?: string | undefined;
}

/** Pointer event shape shared by renderers without requiring host-native event types. */
export interface RenderPointerEvent {
  /** Normalized button index: zero is the primary pointer button. */
  readonly button?: number;
  readonly clientX?: number;
  readonly clientY?: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly detail?: number;
  readonly target?: unknown;
  readonly clickCount?: number;
  readonly shiftKey?: boolean;
  readonly metaKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

/** Opaque paint handles supplied by a concrete renderer. */
export type RenderGradient = object;

/** Opaque pattern handles supplied by a concrete renderer. */
export type RenderPattern = object;

export type RenderPaint = string | RenderGradient | RenderPattern;
export type RenderImageSource = unknown;

export interface RenderImageData {
  readonly data: [number, number, number, number][];
  readonly width: number;
  readonly height: number;
}

/**
 * Host pointer event carrying offsets in view coordinates.
 *
 * Host adapters translate their native pointer event into the same offset
 * contract and optionally provide a normalized click count.
 */
export interface EventWithOffset extends RenderPointerEvent {
  /** Consecutive click count normalized by host adapters when available. */
  readonly clickCount?: number;
}

/**
 * Platform-neutral immediate-mode drawing contract used by render strategies.
 *
 * Concrete render targets implement this shape so scene nodes and strategies
 * can draw without depending on host-specific APIs.
 */
export abstract class RenderContext {
  /** DI token for the primary visible render layer. */
  public static readonly symbol: symbol = Symbol.for('RenderContext');
  /** DI token for the scroll-optimization render layer. */
  public static readonly offScreenSymbol: symbol = Symbol.for('RenderContext.OffScreen');
  /** DI token for the hit-test render layer. */
  public static readonly hitSymbol: symbol = Symbol.for('RenderContext.Hit');
  /** Whether the target has received at least one draw operation. */
  public isDrawn: boolean = false;

  /** Starts a new render frame when the target rebuilds its visual state. */
  public beginFrame(): void {}

  /** Whether the target must rebuild a complete visual frame instead of reusing a pixel cache. */
  public requiresFrameRebuild(): boolean {
    return false;
  }

  /** Whether the target can apply a redraw to only its accumulated dirty regions. */
  public supportsDirtyRedraw(): boolean {
    return true;
  }

  /** Whether an existing node must erase its prior output before it is redrawn. */
  public requiresExplicitNodeClear(): boolean {
    return true;
  }

  /** Resets the complete hit-test frame using the target's native lifecycle. */
  public resetHitFrame(width: number, height: number): void {
    this.save();
    this.setTransform(1, 0, 0, 1, 0, 0);
    this.clearRect(0, 0, width, height);
    this.restore();
  }

  /** Marks subsequent drawing operations as belonging to one semantic scene node. */
  public beginNodeSemantics(_semantics: RenderNodeSemantics): void {}

  /** Ends the semantic scene-node boundary started by beginNodeSemantics. */
  public endNodeSemantics(): void {}

  // Properties
  /** Returns the native backing target owned by this render context. */
  abstract getRenderTarget(): unknown;
  /** Sets a host-visible attribute on the backing target. */
  abstract setAttribute(name: string, value: string): void;
  /** Reads a host-visible attribute from the backing target. */
  abstract getAttribute(name: string): string;

  // Initialization and state
  /** Initializes target sizing and adapter-specific state. */
  abstract initialize(scale?: number): void;
  /** Resizes the backing render target to the host view's logical size and raster scale. */
  abstract resize(width: number, height: number, scale?: number): void;
  /** Logical view scale (distinct from device pixel ratio). */
  abstract setViewScale(scale: number): void;
  /** Returns the current logical view scale. */
  abstract getViewScale(): number;
  /** Raster units represented by one host-view unit for this context. */
  abstract getRasterScale(): number;
  /** Saves the current drawing state. */
  abstract save(): void;
  /** Restores the most recently saved drawing state. */
  abstract restore(): void;

  // Events
  /** Returns the event root associated with this render context. */
  abstract getRoot(): unknown;
  /** Attaches a normalized event listener and returns an idempotent disposer. */
  abstract addEventListener(type: string, callBack: (event: EventWithOffset) => void): () => void;
  /** Attaches a click listener. */
  abstract addClickEventListener(callBack: (event: EventWithOffset) => void): void;
  /** Removes a click listener. */
  abstract removeClickEventListener(callBack: (event: EventWithOffset) => void): void;
  /** Attaches a pointer-press listener. */
  abstract addMouseDownEventListener(callBack: (event: EventWithOffset) => void): void;
  /** Removes a pointer-press listener. */
  abstract removeMouseDownEventListener(callBack: (event: EventWithOffset) => void): void;
  /** Attaches a pointer-move listener. */
  abstract addMouseMoveEventListener(callBack: (event: EventWithOffset) => void): void;
  /** Removes a pointer-move listener. */
  abstract removeMouseMoveEventListener(callBack: (event: EventWithOffset) => void): void;
  /** Attaches a pointer-release listener. */
  abstract addMouseUpEventListener(callBack: (event: EventWithOffset) => void): void;
  /** Removes a pointer-release listener. */
  abstract removeMouseUpEventListener(callBack: (event: EventWithOffset) => void): void;
  /** Attaches a resize listener for host target size changes. */
  abstract addResizeListener(callBack: () => void): void;
  /** Removes the active resize listener, if any. */
  abstract removeResizeListener(): void;

  // Drawing
  /** Begins a new path. */
  abstract beginPath(): void;
  /** Closes the active path. */
  abstract closePath(): void;
  /** Fills the active path with the current fill style. */
  abstract fill(): void;
  /** Strokes the active path with the current stroke style. */
  abstract stroke(): void;
  /** Adds a rectangle to the active path. */
  abstract rect(x: number, y: number, width: number, height: number): void;
  /** Clears a rectangle from the target. */
  abstract clearRect(x: number, y: number, width: number, height: number): void;
  /** Strokes a rectangle without requiring a separate path. */
  abstract strokeRect(x: number, y: number, width: number, height: number): void;
  /** Sets the current stroke line width. */
  abstract setLineWidth(width: number): void;
  /** Returns the current stroke line width. */
  abstract getLineWidth(): number;
  /** Returns the largest stroke width tracked for erase padding. */
  abstract getMaxLineWidth(): number;
  /** Sets the current line dash pattern. */
  abstract setLineDash(segments: number[]): void;
  /** Sets the current stroke style. */
  abstract setStrokeStyle(strokeStyle: RenderPaint): void;
  /** Sets the current fill style. */
  abstract setFillStyle(fillStyle: RenderPaint): void;
  /** Clips future drawing to the active path. */
  abstract clip(): void;
  /** Moves the active path cursor. */
  abstract moveTo(x: number, y: number): void;
  /** Adds a line from the current path cursor. */
  abstract lineTo(x: number, y: number): void;

  // Text
  /** Sets the active platform-neutral font descriptor. */
  abstract setFont(font: string): void;
  /** Draws text at the given position. */
  abstract fillText(text: string, x: number, y: number, maxWidth?: number): void;
  /** Measures text using the active font and returns normalized metrics. */
  abstract measureText(text: string): {
    width: number;
    height: number;
    fontAscent?: number;
    fontDescent?: number;
    fontLineGap?: number;
  };

  // Image
  /** Reads raster pixels from the target. */
  abstract getImageData(x: number, y: number, width: number, height: number): RenderImageData;
  /** Writes raster pixels to the target. */
  abstract putImageData(imageData: RenderImageData, x: number, y: number): void;
  /** Draws an image at its natural size. */
  abstract drawImage(image: RenderImageSource, x: number, y: number): void;
  /** Draws an image into a destination rectangle. */
  abstract drawImage(image: RenderImageSource, x: number, y: number, width: number, height: number): void;
  /** Draws a source image rectangle into a destination rectangle. */
  abstract drawImage(
    image: RenderImageSource,
    x: number,
    y: number,
    width: number,
    height: number,
    sx: number,
    sy: number,
    sWidth: number,
    sHeight: number,
  ): void;

  // Transform
  /** Translates the current drawing transform. */
  abstract translate(x: number, y: number): void;
  /** Resets the current transform to the identity transform. */
  abstract resetTransform(): void;
  /** Replaces the current transform matrix. */
  abstract setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;

  // Nodes
  /** Creates a same-kind render context for an auxiliary render layer. */
  abstract cloneNode(): RenderContext;
  /** Creates a same-kind render context configured for hit testing. */
  abstract createHitNode(): RenderContext;
}
