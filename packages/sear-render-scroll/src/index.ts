/**
 * Logical scrolling, axis locking, boundary feedback, and host scroller adapters.
 *
 * @packageDocumentation
 */

export { ScrollManager } from './ScrollManager';
export { RubberBandConfigError } from './RubberBandConfigError';
export {
  RubberBandController,
  rubberBandDistance,
  type RubberBandConfig,
  type RubberBandInput,
  type RubberBandMotion,
  type RubberBandOffset,
} from './RubberBandController';
export { ScrollAxisLock, type ScrollAxis, type ScrollAxisLockConfig } from './ScrollAxisLock';
export { ScrollAxisLockConfigError } from './ScrollAxisLockConfigError';
export { HeadlessScroller } from './HeadlessScroller';
export { Scroller } from './Scroller';

export { ScrollerFactory } from './ScrollerFactory';

export { type ScrollPublisher, type ScrollManagerState, createDefaultScrollManagerState } from './ScrollManager';
