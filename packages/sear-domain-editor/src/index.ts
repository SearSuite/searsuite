/**
 * Editor-local query, observation, capability, and lifecycle contracts shared by facades.
 *
 * @packageDocumentation
 */

export { SearEditor } from './SearEditor';
export {
  DocLayoutEngine,
  type BlockLayoutSnapshot,
  type DocVerticalAlign,
  type LayoutLine,
  type LayoutSnapshot,
} from './DocLayoutEngine';
export { lockLayoutSnapshot } from './lockLayoutSnapshot';
export { DocLayoutCache, type DocBlockLayout, type DocLayoutRect } from './DocLayoutCache';
export {
  DocBlockLayoutDiff,
  type DocBlockLayoutDiffEntry,
  type DocBlockLayoutDiffOptions,
  type DocBlockLayoutDiffStatus,
  type DocBlockRasterReuse,
} from './DocBlockLayoutDiff';
export {
  type DocBlockRenderDebugCopy,
  type DocBlockRenderDebugRect,
  type DocBlockRenderDebugSnapshot,
  type DocBlockRenderFrameMode,
  type DocBlockRenderPolicyCandidateDebugMetrics,
} from './DocBlockRenderDebugSnapshot';
export { IndexedSnapshot } from './IndexedSnapshot';
export { ArrayIndexedSnapshot } from './ArrayIndexedSnapshot';
export { DocPageMap, type DocPageLayout } from './DocPageMap';
export { DocViewportWindow } from './DocViewportWindow';
export { computeViewportRange, type DocViewportRange, type DocViewportScrollSource } from './DocViewportRange';
