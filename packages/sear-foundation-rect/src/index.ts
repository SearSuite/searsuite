/**
 * Immutable rectangle geometry and intersection utilities.
 *
 * @packageDocumentation
 */

/**
 * Public API for grid and positioned rectangle helpers.
 *
 * This module re-exports the core geometry primitives used by other searTable
 * packages to describe rectangular selections, layout bounds, and range-based
 * value lookup.
 */
export { Rect, createEmptyRect, createEmptyRectShape, type Point } from './Rect';

export { RangeRect } from './RangeRect';
export { RangeRectManager } from './RangeRectManager';

export { type PositionRectProps, PositionRect, emptyPositionRect } from './PositionRect';
export { PositionRectManager } from './PositionRectManager';
