/**
 * Retained scene nodes, rich-text render registries, and spatial indexing.
 *
 * @packageDocumentation
 */

/**
 * @referenceChapter 0 scene-tree Build a scene from owned nodes
 * @referenceBody
 * `SceneGraph` is the root of the retained render tree. A plugin contributes one or more `Node` values under its
 * own key. `addPluginNode()` replaces that plugin's top-level nodes; `reconcilePluginNodes()` retains nodes with
 * stable keys and updates only what changed. `GenerationalDirtyTracker` records the regions that need repainting.
 *
 * Use this layer when implementing a renderer or a visual plugin. Content and selection still come from their
 * domain owners; scene nodes hold the geometry and paint behavior for a view.
 */

/**
 * @referenceChapter 1 rich-text-and-hit-testing Find the right render node
 * @referenceBody
 * Rich text uses block, line, run, caret, and selection nodes. `RichTextRunRenderRegistry` lets a feature provide
 * paint behavior for a run without changing the shared tree. `HitColorRegistry` and the spatial indexes support
 * finding nodes from pointer coordinates. Start with `SceneGraph` for ownership, then choose the node type that
 * represents the visual element you need to paint or hit test.
 */

export { EventListener } from './EventListener';
export { Container } from './Container';

export { type HitColorKey, type NodeProperties, type RenderNodeKey } from './types';

export { Tree } from './Tree';
export { DirtyTree } from './DirtyTree';
export { GenerationalDirtyTracker } from './GenerationalDirtyTracker';
export { HitColorRegistry } from './HitColorRegistry';

export { Node, type ClipRegion } from './Node';
export { LayoutNode } from './LayoutNode';
export { RenderNode } from './RenderNode';
export { BoxNode } from './BoxNode';
export { FixBoxNode } from './FixBoxNode';
export { CellVisualLayerNode } from './CellVisualLayerNode';
export { CellVisualIconShape, CellVisualLayerShape, type CellVisualLayer, type CellVisualLabel } from './types';
export { DashedLineNode } from './DashedLineNode';
export { createDragGuideNode } from './createDragGuideNode';
export { AffixNode, AffixTextNode, SheetCornerNode } from './AffixNode';
export { SceneGraph } from './SceneGraph';
export { StickyNode } from './StickyNode';
export { TextNode } from './TextNode';
export { BlockManager } from './BlockManager';
export { RichTextVisualNode, type RichTextVisualNodeInput } from './RichTextVisualNode';
export { RichTextLineRenderer } from './RichTextLinePainter';
export { RichTextRunRenderer } from './RichTextRunRenderer';
export {
  RichTextRunRenderRegistry,
  type RichTextRunPaintInput,
  type RichTextRunRenderContribution,
} from './RichTextRunRenderRegistry';
export { RichTextBlockNode } from './RichTextBlockNode';
export { RichTextContentNode } from './RichTextContentNode';
export { RichTextSelectionNode, type RichTextSelectionRect } from './RichTextSelectionNode';
export { RichTextCaretNode } from './RichTextCaretNode';
export { RichTextCompositionNode } from './RichTextCompositionNode';
export { RichTextRunNode } from './RichTextRunNode';
export { ViewportOverlayNode } from './ViewportOverlayNode';
export { createRichTextRunRect } from './RichTextRenderNodeUtils';
export {
  type RichTextBlockId,
  type RichTextInlineStyle,
  type RichTextRenderChar,
  type RichTextRenderNodeProperties,
  type RichTextRenderLine,
} from './RichTextRenderNodeTypes';

export { QuadTree, QuadTreeFactory } from './QuadTree';
export { HilbertRTree } from './HilbertRTree';
export { KDTree } from './KDTree';
export { RTree } from './RTree';
export { SpatialHash } from './SpatialHash';
export { Octree } from './Octree';
export { BVH } from './BVH';
