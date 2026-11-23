/**
 * Platform-neutral drawing contracts with Web Canvas, SVG, WebGL, and headless adapters.
 *
 * @packageDocumentation
 */

/**
 * @referenceChapter 0 drawing-contract A drawing target shared by renderers
 * @referenceBody
 * `RenderContext` is the drawing contract used by scene nodes and render strategies. It receives drawing commands
 * for a frame; the host chooses the concrete target. A web host can use `WebCanvasRenderContext`,
 * `WebSvgRenderContext`, or `WebWebGLRenderContext`. A host without a visible view can use
 * `HeadlessRenderContext`.
 *
 * The editor also uses separate offscreen and hit-test contexts. Their DI tokens are
 * `RenderContext.offScreenSymbol` and `RenderContext.hitSymbol`; the visible target uses `RenderContext.symbol`.
 * Render code uses these contracts so it does not need to know which host target was chosen.
 */

/**
 * @referenceChapter 1 coordinates Convert between view and document positions
 * @referenceBody
 * Pointer input begins in host-view coordinates, while document content and scrolling use world coordinates.
 * `CoordinateTransformer.viewToWorld()` applies the current view scale and scroll offset before hit testing or
 * selecting content. `worldToView()` maps a document position back to the visible view.
 *
 * Use `viewToRaster()` only when reading pixels from the hit-test target: raster coordinates also account for
 * that target's pixel scale. `CoordinatePoint` is the simple `{x, y}` value passed between these conversions.
 */

export {
  RenderContext,
  type EventWithOffset,
  type RenderNodeSemantics,
  type RenderPointerEvent,
  type RenderGradient,
  type RenderPattern,
  type RenderPaint,
  type RenderImageSource,
  type RenderImageData,
} from './RenderContext';

export { HeadlessRenderContext } from './HeadlessRenderContext';
export { HeadlessOffScreenRenderContext } from './HeadlessOffScreenRenderContext';
export { HeadlessHitRenderContext } from './HeadlessHitRenderContext';
export { CoordinateTransformer, type CoordinatePoint } from './CoordinateTransformer';
