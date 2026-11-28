import { SheetCommandEffectRegistry } from '@searsuite/sear-assembly-commands';
import { createSheetEmbeddedSearCoreEditor } from '@searsuite/sear-assembly-sheet-doc';
import { prepareSheetKernel, SheetKernel } from '@searsuite/sear-assembly-sheet-kernel';
import { registerSheetCellStyleView } from '@searsuite/sear-render';
import { ViewExtensionRegistry } from '@searsuite/sear-render-event-engine';
import {
  SheetViewCapability,
  type SheetView,
  type SheetViewRuntimeContext,
  type SheetViewSetupContext,
} from './SheetViewContracts';
import { registerDefaultSheetViews } from './registerDefaultSheetViews';
import { sealSheetViewWrites } from './sealSheetViewWrites';

import { SheetCellStyleRegistry } from '@searsuite/sear-domain-cell-types';

import { SheetHighlightRegistry } from '@searsuite/sear-render';
import { bindSheetFormatPainterHighlight } from './runtimePlugin/formatPainter/bindSheetFormatPainterHighlight';

import { sealSheetContributionWrites } from '@searsuite/sear-assembly-plugin';

import { SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { createRuntimeCapabilityReader, EditorLifecycleStack } from '@searsuite/sear-assembly-plugin';
import { Container, Scope } from '@searsuite/sear-foundation-di';

import {
  registerSheetPluginCapabilities,
  registerSheetPluginCommands,
  registerSheetPluginObservations,
  registerSheetPluginQueries,
  registerSheetPluginSessionStates,
  SheetRuntimeCapability,
  type SheetPluginServiceContext,
} from '@searsuite/sear-assembly-commands';
import { SearCoreSheet, SheetLifecycleCoordinator, SheetViewportResizeController } from '@searsuite/sear-assembly-core';
import { createSheetViewSetupRuntime } from './SheetViewContracts';

import { SearFormulaBar, SearToolbar } from '@searsuite/sear-assembly-plugin';
import { sealCellExtensionWrites, SheetDisplayedValueChanges } from '@searsuite/sear-domain-cell-types';
import { EventEngine, EventRegistrar } from '@searsuite/sear-render-event-engine';
import { SheetRenderCoordinatorManager, type CellProperties } from '@searsuite/sear-render-registry';
import { ScrollManager } from '@searsuite/sear-render-scroll';
import { RenderStrategyManager } from '@searsuite/sear-render-strategy';
import { SheetEmbeddedEditor } from '@searsuite/sear-sheet-editor-contract';

import { readSheetCellMerges } from '@searsuite/sear-plugin-cell-merge';
import { SheetFilterPlugin } from '@searsuite/sear-plugin-filter';
import { SheetCellMergeRender, SheetGridView } from '@searsuite/sear-render';
import { registerEditorBaseServices } from './registerEditorBaseServices';
import { registerEditorRuntime } from './registerEditorRuntime';

import { registerSheetViewportCommands, registerSheetViewportSessionState } from './SheetViewportCommands';

import { type SheetEditor } from '@searsuite/sear-assembly-commands';
import { type SheetEditorConfiguration } from './SheetEditorContracts';

export type { SheetEditorAdapters, SheetEditorConfiguration } from './SheetEditorContracts';

/**
 * Assembles the default sheet editor runtime from platform adapters and state.
 *
 * The returned editor owns an isolated dependency container, plugin graph, and
 * render lifecycle. Hosts interact with it through commands, queries,
 * observations, and services, and must call `destroy()` when the session is
 * no longer mounted.
 *
 * @param options Platform adapters, initial Sheet state, plugins, and runtime configuration.
 * @returns A fully initialized Sheet editor facade.
 * @example
 * ```ts
 * const editor = createSheetEditor({ adapters, sheetState, plugins });
 * await editor.commands.run(command, input);
 * editor.destroy();
 * ```
 */
export function createSheetEditor(options: SheetEditorConfiguration): SheetEditor {
  const editorDIContainer = new Container();
  const lifecycle = new EditorLifecycleStack();
  lifecycle.add(() => editorDIContainer.reset());
  try {
    return assembleSheetEditor(editorDIContainer, lifecycle, options);
  } catch (error) {
    disposeFailedSheetEditor(lifecycle, error);
  }
}

function assembleSheetEditor(
  editorDIContainer: Container,
  lifecycle: EditorLifecycleStack,
  options: SheetEditorConfiguration,
): SheetEditor {
  const { adapters } = options;
  const viewport = options.viewport ?? { width: 800, height: 600 };
  const business = prepareSheetKernel(editorDIContainer, lifecycle, options);
  const { configEngine, dataEngine } = business;
  const { stage } = registerEditorBaseServices(editorDIContainer, viewport);
  const embeddedEditor = options.embeddedEditor ?? createSheetEmbeddedSearCoreEditor();
  editorDIContainer.registerFactory(SheetEmbeddedEditor.symbol, () => embeddedEditor, Scope.Singleton);
  const pluginServiceContext: SheetPluginServiceContext = {
    container: editorDIContainer,
  };
  for (const implementation of options.viewExtensions ?? []) {
    editorDIContainer.register(implementation.symbol, implementation, Scope.Singleton);
    implementation.registerServices?.(pluginServiceContext);
  }
  const {
    renderContexts,
    rendererRegistry,
    scroller,
    scrollManager,
    embeddedEditor: runtimeEmbeddedEditor,
    pluginManager,
  } = registerEditorRuntime(editorDIContainer, adapters, viewport, configEngine.getDefaultConfig().devicePixelRatio);
  registerDefaultSheetViews(editorDIContainer, adapters);
  const viewSetupRuntime = createSheetViewSetupRuntime({
    stateRuntime: business.runtime,
    container: editorDIContainer,
    configEngine,
    dataEngine,
    stage,
    renderContexts: {
      main: renderContexts.main,
      offScreen: renderContexts.offScreen,
      hit: renderContexts.hit,
    },
    rendererRegistry,
    scroller,
    scrollManager,
    embeddedEditor: runtimeEmbeddedEditor,
    pluginManager,
  });
  const stateSetupRuntime = business.runtime;
  const commands = editorDIContainer.resolve<SheetCommandBus>(SheetCommandBus.symbol);
  const queries = viewSetupRuntime.queries;
  const observations = viewSetupRuntime.observations;
  const views = editorDIContainer.resolve<ViewExtensionRegistry<SearCoreSheet, CellProperties>>(
    ViewExtensionRegistry.symbol,
  );
  const customViews = (options.viewExtensions ?? []).map((implementation) =>
    editorDIContainer.resolve<SheetView>(implementation.symbol),
  );
  for (const view of customViews) views.register(view);
  const viewSetupContext: SheetViewSetupContext = {
    container: editorDIContainer,
    runtime: viewSetupRuntime,
    addStrategy: (token, strategy, position) => {
      if ('before' in position) viewSetupRuntime.render.strategies.addStrategyBefore(position.before, token, strategy);
      else viewSetupRuntime.render.strategies.addStrategyAfter(position.after, token, strategy);
    },
  };
  for (const view of customViews) view.configure?.(viewSetupContext);
  const cellVisualReaders = viewSetupRuntime.render.cellVisualReaders;
  lifecycle.add(() => cellVisualReaders.destroy());
  const styles = editorDIContainer.resolve<SheetCellStyleRegistry>(SheetCellStyleRegistry.symbol);

  registerSheetCellStyleView(cellVisualReaders, viewSetupRuntime.styles);
  registerSheetViewportSessionState(viewSetupRuntime.session, scrollManager);
  registerSheetPluginCommands(views.getAll(), commands);
  registerSheetPluginQueries(views.getAll(), queries);
  registerSheetPluginObservations(views.getAll(), observations);
  registerSheetPluginSessionStates(views.getAll(), viewSetupRuntime.session);
  registerSheetPluginCapabilities(views.getAll(), viewSetupRuntime.extensions);
  editorDIContainer.register(SearCoreSheet.symbol, SearCoreSheet, Scope.Singleton);
  const core = editorDIContainer.resolve<SearCoreSheet>(SearCoreSheet.symbol);
  const kernel = editorDIContainer.resolve<SheetKernel>(SheetKernel.symbol);
  const disposeDisplayedValueRender = bindDisplayedValueRender(editorDIContainer, core);
  const effectRegistry = editorDIContainer.resolve<SheetCommandEffectRegistry>(SheetCommandEffectRegistry.symbol);
  registerSheetViewportCommands(
    commands,
    scrollManager,
    editorDIContainer.resolve<SheetViewportResizeController>(SheetViewportResizeController.symbol),
  );
  if (editorDIContainer.hasBinding(SearToolbar.symbol)) {
    viewSetupRuntime.extensions.register(
      SheetViewCapability.Toolbar,
      editorDIContainer.resolve<SearToolbar>(SearToolbar.symbol),
    );
  }
  if (editorDIContainer.hasBinding(SearFormulaBar.symbol)) {
    const formulaBar = editorDIContainer.resolve<SearFormulaBar>(SearFormulaBar.symbol);
    viewSetupRuntime.extensions.register(SheetViewCapability.FormulaBar, formulaBar);
  }
  const viewRuntime = {
    ...viewSetupRuntime,
    commands,
    toolbar: viewSetupRuntime.extensions.get(SheetViewCapability.Toolbar),
  };
  const viewRuntimeContext: SheetViewRuntimeContext = { ...viewSetupContext, core, runtime: viewRuntime };
  const embeddedEditorTeardownToken = {};
  embeddedEditor.bindTeardownToken?.(embeddedEditorTeardownToken);
  const coreTeardownToken = {};
  lifecycle.add(() => core.destroyView(coreTeardownToken));
  lifecycle.add(disposeDisplayedValueRender);
  lifecycle.add(() => views.destroy());
  lifecycle.add(() => embeddedEditor.dispose(embeddedEditorTeardownToken));
  views.forEach((view) => {
    view.registerConfig?.().forEach((entry) => configEngine.registerConfig(entry.key, entry.config));
  });
  business.initialize(() => core.initialize());
  customViews.forEach((view) => view.initialize?.(viewRuntimeContext));
  lifecycle.add(
    bindSheetFormatPainterHighlight(
      editorDIContainer.resolve<SheetHighlightRegistry>(SheetHighlightRegistry.symbol),
      observations,
      viewRuntime.input.cursor,
    ),
  );
  business.start();
  core.start();
  customViews.forEach((view) => view.start?.(viewRuntimeContext));
  const assertExtensionCommand = business.seal();
  const lifecycleCoordinator = editorDIContainer.resolve<SheetLifecycleCoordinator>(SheetLifecycleCoordinator.symbol);
  const lifecycleTeardownToken = {};
  lifecycle.add(() => lifecycleCoordinator.beginTeardown(lifecycleTeardownToken));
  SheetLifecycleCoordinator.prototype.enforceCommandBoundary.call(
    lifecycleCoordinator,
    assertExtensionCommand,
    lifecycleTeardownToken,
  );
  SearCoreSheet.prototype.enforceViewTeardownBoundary.call(core, coreTeardownToken);
  EventEngine.prototype.enforceWriteBoundary.call(core.eventEngine, assertExtensionCommand, coreTeardownToken);
  EventRegistrar.prototype.enforceCommandBoundary.call(core.eventEngine.eventRegistrar, assertExtensionCommand);
  const cellCoordinator = editorDIContainer.resolve<SheetRenderCoordinatorManager>(
    SheetRenderCoordinatorManager.symbol,
  );
  [cellVisualReaders, cellCoordinator, cellCoordinator.nodeFactory, cellCoordinator.rendererRegistry].forEach((owner) =>
    sealCellExtensionWrites(owner, assertExtensionCommand),
  );
  [
    views,
    viewSetupRuntime.input.cursorRules,
    editorDIContainer.resolve<SheetHighlightRegistry>(SheetHighlightRegistry.symbol),
  ].forEach((owner) => sealSheetContributionWrites(owner, assertExtensionCommand));
  RenderStrategyManager.prototype.enforceCommandBoundary.call(
    viewSetupRuntime.render.strategies,
    commands.isExecuting.bind(commands),
  );
  sealSheetViewWrites(views, assertExtensionCommand);
  ScrollManager.prototype.enforceCommandBoundary.call(scrollManager, commands.isExecuting.bind(commands));
  if (viewRuntime.extensions.has(SheetViewCapability.FormulaBar)) {
    const formulaBar = viewRuntime.extensions.require(SheetViewCapability.FormulaBar);
    lifecycle.add(() => formulaBar.destroy());
  }
  let destroyed = false;
  const editor: SheetEditor = {
    commands,
    queries,
    observations,
    services: createRuntimeCapabilityReader(viewRuntime.extensions, [
      SheetRuntimeCapability.Plugins,
      SheetRuntimeCapability.Data,
      SheetRuntimeCapability.Session,
      SheetRuntimeCapability.Interaction,
      SheetViewCapability.Lifecycle,
    ]),
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      lifecycle.dispose();
    },
  };
  lifecycle.add(() => core.beginTeardown(coreTeardownToken));
  options.onCreated?.(editor);
  business.sealCommands();
  return editor;
}

function disposeFailedSheetEditor(lifecycle: EditorLifecycleStack, setupError: unknown): never {
  try {
    lifecycle.dispose();
  } catch (cleanupError) {
    throw new AggregateError([setupError, cleanupError], 'SheetEditor setup and cleanup both failed.');
  }
  throw setupError;
}

function bindDisplayedValueRender(container: Container, core: SearCoreSheet): () => void {
  const changes = container.resolve<SheetDisplayedValueChanges>(SheetDisplayedValueChanges.symbol);
  const sheetGridPlugin = container.resolve<SheetGridView>(SheetGridView.symbol);
  const mergeRender = container.resolve<SheetCellMergeRender>(SheetCellMergeRender.symbol);
  const filter = container.resolve<SheetFilterPlugin>(SheetFilterPlugin.symbol);
  return changes.subscribe((cells) => {
    if (!filter.active) {
      const merges = readSheetCellMerges(core.getDataEngine());
      const changesMergedAnchor =
        merges &&
        cells.some(({ row, column }) => {
          const anchor = merges.findRange(row, column)?.getPoint(0);
          return anchor?.[0] === row && anchor[1] === column;
        });
      if (!changesMergedAnchor) {
        core.requestRender(sheetGridPlugin);
        return;
      }
      core.requestRender(sheetGridPlugin, mergeRender);
      return;
    }
    core.requestRender(...core.getViewExtensions().getAll());
  });
}
