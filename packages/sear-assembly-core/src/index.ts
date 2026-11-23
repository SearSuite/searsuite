/**
 * The staged Sheet and Doc runtimes that execute pipelines and commit transactions.
 *
 * @packageDocumentation
 */

/**
 * @referenceChapter 0 core-runtime Where a command is executed
 * @referenceBody
 * `SearCoreSheet` coordinates Sheet plugins, the data registry, input events, and rendering. `SearCoreDoc` does the
 * corresponding work for a rich document. Host applications normally create these through an editor assembly;
 * a feature plugin meets the core through the plugin and command contracts.
 *
 * A command produces a `Pipeline`. Its steps stage document transactions and local interaction changes, then
 * commit them through the owning core. Render work follows the commit, so a failed step does not publish a partial
 * document update.
 */

/**
 * @referenceChapter 1 pipeline-steps Distinguish durable and local work
 * @referenceBody
 * `PipelineStepKind.Transaction` stages an OT transaction for the document. `Interaction` changes editor-local
 * interaction state, while `Render` and `PostRender` request painting. `PreparedAction` can roll back local
 * preparation if staging fails; `PostCommit` publishes local state only after the document commit succeeds.
 *
 * Use the command layer to request an edit. Use these step contracts when implementing a command or plugin that
 * contributes ordered work to the core runtime.
 */

export { SearCore } from './SearCore';
export { SearCoreSheet } from './SearCoreSheet';
export { lockCommittedSheetState } from './lockCommittedSheetState';
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
export {
  DocInputPlugin,
  DocInputTransactionMeta,
  type DocInputDispatchResult,
  type DocInputState,
} from './DocInputPlugin';
export { DocRenderEngine, type DocRenderViewport } from '@searsuite/sear-render-engine';
export {
  SearAssemblyErrorCode,
  SearRegistryConflictError,
  SearRegistryEntryNotFoundError,
  SearPipelineStepExecutorNotFoundError,
  SearLifecycleError,
  SearDocParseError,
  SearContractViolationError,
} from './errors/SearAssemblyError';
export { Pipeline, PipelineStepKind, type PipelineStep, type PipelineLifecycle } from './Pipeline';
export {
  PipelineStepExecutorRegistry,
  type PipelineStepExecutor,
  type PipelineStepExecutionContext,
} from './PipelineStepExecutorRegistry';
export { ConsolePipelineLogger } from './ConsolePipelineLogger';
export {
  getActiveCommandId,
  isInsideCommandExecution,
  runInsideCommandExecution,
  runOutsideCommandExecution,
  getCommandObserverEpoch,
  warnIfOutsideCommandExecution,
  warnIfSyntheticCommandDefinition,
} from './CommandExecutionScope';
export { SheetLifecycleCoordinator } from './SheetLifecycleCoordinator';
export { SheetViewportResizeController } from './SheetViewportResizeController';
export {
  SheetInteractionStore,
  type SheetInteractionSignal,
  type SheetInteractionState,
  type SheetEditSession,
} from './SheetInteractionStore';
export { SheetInteractionReducerRegistry, type SheetInteractionReducer } from './SheetInteractionReducerRegistry';
export { type SheetLifecycleContext, type SheetLifecycleController } from './SheetLifecycleController';
export { SheetMatrix, type CellMatrixElement } from '@searsuite/sear-render-engine';
