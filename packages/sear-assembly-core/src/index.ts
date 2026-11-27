/**
 * Visual Sheet sessions and the document input, layout and presentation runtime.
 *
 * @packageDocumentation
 */

/**
 * @referenceChapter 0 core-runtime Where a command is executed
 * @referenceBody
 * `SheetKernel` from `sear-assembly-sheet-kernel` owns Sheet state, transaction staging and commit publication.
 * `SearCoreSheet` attaches view extensions, native input and retained rendering to that independent kernel.
 * `SearCoreDoc` coordinates document input, layout and presentation. Hosts normally create these through editor
 * assemblies; business plugins receive neutral plugin and command contracts rather than a Core instance.
 *
 * A command produces a `Pipeline`. The owning state runtime stages its transactions and interaction changes,
 * then publishes a successful commit. Independent visual subscribers read committed state to update the scene.
 * A failed staged step never publishes a partial document update.

 */

/**
 * @referenceChapter 1 pipeline-steps Distinguish durable and local work
 * @referenceBody
 * `PipelineStepKind.Transaction` stages an OT transaction for the document. `Interaction` changes editor-local
 * interaction state, while `Invalidate` marks derived projections for committed consumers. `PreparedAction` can roll back local
 * preparation if staging fails; `PostCommit` publishes local state only after the document commit succeeds.
 *
 * Use the command layer to request an edit. Use these step contracts when implementing a command or plugin that
 * contributes ordered work to the state runtime.
 */

export { SearCoreSheet } from './SearCoreSheet';
export {
  SearCoreDoc,
  type DocEditorRenderLayoutInput,
  type DocPreparedEditorRenderLayout,
  type DocRenderLayoutState,
  type DocRenderRequest,
  type DocRenderRequestHandler,
  type SearCoreDocRuntimeLayers,
} from './SearCoreDoc';
export {
  collectDocReflowBlockIds,
  collectDocRepaintBlockIds,
  collectDocRenderOperations,
  type DocRenderDirtyBlockIds,
  type DocRenderOperation,
  type DocRenderOperations,
} from './DocRenderDirtyBlocks';
export { DocCursorManager, type CursorRenderInfo, type SelectionRect } from './DocCursorManager';
export { DocCompositionManager, type DocCompositionLayout, type DocCompositionProvider } from './DocCompositionManager';
export { NoopDocCompositionProvider } from './NoopDocCompositionProvider';
export { DocImmediateRenderPainter, type DocImmediateRenderPainterContentInput } from './DocImmediateRenderPainter';
export { DocRenderEngine, type DocRenderViewport } from '@searsuite/sear-render-engine';

export { ConsolePipelineLogger } from './ConsolePipelineLogger';

export { SheetLifecycleCoordinator } from './SheetLifecycleCoordinator';
export { SheetViewportResizeController } from './SheetViewportResizeController';

export { type SheetLifecycleContext, type SheetLifecycleController } from './SheetLifecycleController';

export { DocRenderOperationType } from './DocRenderDirtyBlocks';
