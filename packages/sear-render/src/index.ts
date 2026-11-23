/**
 * Public rendering facade that composes contexts, nodes, strategies, and registries.
 *
 * @packageDocumentation
 */

/**
 * @guideChapter 5 rendering Render
 * @guideBody
 * `sear-render-*` defines scene, drawing, input, and viewport contracts for visual editors. Host adapters implement
 * platform-specific painting and event handling against those contracts.
 *
 * `RenderContext` exposes immediate drawing operations using platform-neutral values. Each visual host implements this
 * interface with its own rendering backend. Retained scene nodes, cell render registries, dirty-region strategies, hit
 * testing, cursor policy, input routing, and scrolling are separate concerns with their own contracts.
 *
 * For example, a render strategy uses the same `RenderContext` calls regardless of the host's drawing backend:
 *
 * ```ts
 * context.setFillStyle('#00a870');
 * context.beginPath();
 * context.rect(x, y, width, height);
 * context.fill();
 * ```
 *
 * `TextShaper` returns glyph, cluster, caret-stop, and advance data using UTF-16 offsets. Native text-system values
 * remain inside their adapters. Each editor composition root registers one text shaper.
 *
 * ```ts
 * const shaped = textShaper.shape({ text: 'Hello', font: '14px sans-serif' });
 * const width = shaped.width;
 * const caretPositions = shaped.caretStops;
 * ```
 *
 * `Platform` abstracts timers, event registration, resize observation, host-view offsets, identifiers, and warnings.
 * Reusable render packages depend on that contract rather than host globals, allowing different hosts to use the same
 * transaction and plugin layers.
 * For example, the scroll controller schedules its next frame with `platform.requestAnimationFrame()` rather than
 * calling a host-specific timer directly.
 *
 * ```ts
 * this.returnFrame = this.platform.requestAnimationFrame(this.runReturnFrame.bind(this));
 * ```
 */

export { SheetGridRender } from './sheet/SheetGridRender';
export { SheetGridPlugin } from './sheet/SheetGrid';
export { activeFixedRowOffsets } from './sheet/SheetFreezeLayout';

export { SheetRowNumberPlugin } from './sheet/SheetRowNumber';
export { SheetColumnLabelPlugin } from './sheet/SheetColumnLabel';
export { SheetCornerPlugin } from './sheet/corner/SheetCornerPlugin';
export { SheetCellMergeRender } from './sheet/SheetCellMergeRender';
export { getSheetRangePositionRect, type SheetRangePositionContext } from './sheet/getSheetRangePositionRect';

export { computeViewportRange, type ViewportRange } from './ViewportRange';
