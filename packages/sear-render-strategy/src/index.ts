/**
 * Full, dirty-region, retained, and incremental rendering policies.
 *
 * @packageDocumentation
 */

/**
 * Public entry point for the render strategy package.
 *
 * This module re-exports all built-in rendering strategies and the strategy manager
 * used by the render engine pipeline. Consumers can import from this file to keep
 * integration code stable even when internal file layout changes.
 */
export { RenderStrategy } from './RenderStrategy';
export { EventRenderStrategy } from './EventRenderStrategy';
export { HitRenderStrategy } from './HitRenderStrategy';
export {
  ScreenRenderStrategy,
  type ScreenRenderFrameMode,
  type ScreenRenderStrategyRuntime,
} from './ScreenRenderStrategy';
export { StickyRenderStrategy } from './StickyRenderStrategy';
export { OverlayRenderStrategy } from './OverlayRenderStrategy';

export { RenderStrategyManager } from './RenderStrategyManager';

export { DirtyRenderStrategy } from './DirtyRenderStrategy';
export { DirtyRegionCollector, type DirtyRegionBounds, type DirtyRegionSource } from './DirtyRegionCollector';
export { RasterCopyExecutor } from './RasterCopyExecutor';
export { RasterCopyPlan, type RasterCopyRect } from './RasterCopyPlan';
export {
  BlockRasterCopyPlan,
  type BlockRasterCopyCandidate,
  type BlockRasterCopyPlanInput,
} from './BlockRasterCopyPlan';
export {
  DEFAULT_INCREMENTAL_RENDER_POLICY_LIMITS,
  IncrementalRenderDecisionReason,
  IncrementalRenderPolicy,
  type IncrementalRenderCandidate,
  type IncrementalRenderDecision,
  type IncrementalRenderPolicyLimits,
} from './IncrementalRenderPolicy';
export { createViewportFrameCache, ViewportFrameCache } from './ViewportFrameCache';
export {
  clearViewport,
  clearViewportRect,
  readRenderContextCapabilities,
  requiresViewportExplicitNodeClear,
  requiresViewportFrameRebuild,
  supportsViewportDirtyRedraw,
  worldRectToViewportClearRect,
  type RenderContextCapabilities,
} from './ViewportRenderHelpers';
