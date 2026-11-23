import { SheetHighlightRegistry } from '@searsuite/sear-plugin-selection';
import { bindSheetFormatPainterHighlight } from './runtimePlugin/formatPainter/bindSheetFormatPainterHighlight';
import { SheetClipboardTransferRegistry, SheetFormatTransferRegistry } from '@searsuite/sear-assembly-plugin';
import { registerSheetFormatTransfers } from './runtimePlugin/formatPainter/registerSheetFormatPainterPlugin';
import {
  SheetRangeMoveRegistry,
  SheetRangeReorderRegistry,
  SheetStructureMoveRegistry,
  sealSheetContributionWrites,
} from '@searsuite/sear-assembly-plugin';
import { registerSheetStructureMoves } from './registerSheetStructureMoves';
import { registerSheetRangeMoves } from './registerSheetRangeMoves';
import { registerSheetRangeReorders } from './registerSheetRangeReorders';
import { registerSheetClipboardTransfers } from './registerSheetClipboardTransfers';
import { Container, Scope } from '@searsuite/sear-foundation-di';
import { cloneSessionStateValue, createRuntimeCapabilityReader, EditorLifecycleStack, PluginManager, RuntimeCapabilityRegistry, SessionStateRestorePhase } from '@searsuite/sear-assembly-plugin';
import { SheetCommandBus, SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { ConfigEngine } from '@searsuite/sear-assembly-config';
import {
  createSheetPluginSetupRuntime,
  registerSheetPluginCellVisualReaders,
  registerSheetPluginCommands,
  registerSheetPluginQueries,
  registerSheetPluginCapabilities,
  registerSheetPluginObservations,
  registerSheetPluginSessionStates,
  SheetRuntimeCapability,
  type SheetPlugin,
  type SheetPluginRuntimeContext,
  type SheetPluginServiceContext,
  type SheetPluginSetupContext,
} from './SheetPluginContracts';
import { Pipeline, SearContractViolationError, SearCore, SearCoreSheet, SheetInteractionStore, SheetLifecycleCoordinator, SheetViewportResizeController } from '@searsuite/sear-assembly-core';
import { ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { EventEngine, EventRegistrar } from '@searsuite/sear-render-event-engine';
import { ScrollManager } from '@searsuite/sear-render-scroll';
import { SheetRenderCoordinatorManager, type CellProperties } from '@searsuite/sear-render-registry';
import { FakeSheetEmbeddedEditor, SheetEmbeddedEditor } from '@searsuite/sear-sheet-editor-contract';
import { RenderStrategyManager } from '@searsuite/sear-render-strategy';
import { SearFormulaBar, SearToolbar } from '@searsuite/sear-assembly-plugin';
import {
  CellClipboardCodecRegistry, CellCommitStrategyRegistry, CellFormatTransferRegistry,
  sealCellExtensionWrites, SheetCellInputValidationRegistry, SheetDisplayedValueChanges,
} from '@searsuite/sear-domain-cell-types';
import { CellDisplayTextRegistry } from '@searsuite/sear-domain-cell';
import {
  FormulaDateSystem,
  IFormulaDateSystemProvider,
  IFormulaExternalServiceProvider,
  IFunctionRegistry,
} from '@searsuite/sear-domain-formula-engine';
import { SheetSelectionPlugin } from '@searsuite/sear-plugin-selection';
import { ApplySheetCollaborationEventCommand, CollaborationChannel, CollaborationChannelBinding } from '@searsuite/sear-plugin-collab';
import { CellFormulaValueConverterRegistry, FormulaRegistryOwnership, RecalcScheduler, SheetFormulaPlugin } from '@searsuite/sear-plugin-formula';
import { FormulaExternalServiceRegistry } from '@searsuite/sear-domain-formula-engine-ts';
import { SheetCellEditorPlugin } from '@searsuite/sear-plugin-cell-editor';
import { SheetCellMergeRender, SheetGridPlugin } from '@searsuite/sear-render';
import { readSheetCellMerges } from '@searsuite/sear-plugin-cell-merge';
import { SheetFilterPlugin } from '@searsuite/sear-plugin-filter';
import { registerDefaultSheetFeatures } from './registerDefaultSheetFeatures';
import { cloneSheetDocumentState } from './cloneSheetDocumentState';
import { registerEditorBaseServices } from './registerEditorBaseServices';
import { registerEditorRuntime } from './registerEditorRuntime';
import { sealSheetPluginTeardownWrites } from './sealSheetPluginTeardownWrites';
import { registerDefaultSheetStructureCommands } from './SheetStructureCommands';
import { registerDefaultSheetRangeCommands } from './SheetRangeCommands';
import { registerSheetViewportCommands, registerSheetViewportSessionState } from './SheetViewportCommands';
import { registerSheetConfigCommands } from './SheetConfigCommands';
import { registerSheetInputValidationCommands, UnregisterSheetInputValidatorCommand } from './SheetInputValidationCommands';
import { registerSheetDisplayedValueCommands } from './SheetDisplayedValueCommands';
import { registerSheetStateSnapshotCommands } from './SheetStateSnapshotCommands';
import { registerSheetSessionStateCommands } from './SheetSessionStateCommands';
import { DefaultSheetClipboardDataSource } from './DefaultSheetClipboardDataSource';
import { SheetClipboardDataSourceSymbol } from '@searsuite/sear-plugin-clipboard';
import { SheetClipboardWorkbookBridgeSymbol, type SheetClipboardWorkbookBridge } from './SheetClipboardWorkbookBridge';
import {
  type SheetEditor,
  type SheetEditorAdapters,
  type SheetEditorConfiguration,
  type SheetEditorPlugin,
  type SheetEditorPluginImplementation,
  type SheetDocumentState,
  type SheetSessionState,
} from './SheetEditorContracts';

export type {
  SheetEditor,
  SheetEditorAdapters,
  SheetEditorConfiguration,
  SheetDocumentState,
  SheetSessionState,
} from './SheetEditorContracts';

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
  const { configEngine, dataEngine, stage } = registerEditorBaseServices(editorDIContainer, adapters, viewport, {
    ...(options.cellFontSize === undefined ? {} : { sheetCellFontSize: options.cellFontSize }),
    ...(options.cellFontFamily === undefined ? {} : { sheetCellFontFamily: options.cellFontFamily }),
  });
  adapters.registerEnvironment?.(editorDIContainer);
  if (!editorDIContainer.hasBinding(IFormulaDateSystemProvider.symbol)) {
    editorDIContainer.registerInstance(IFormulaDateSystemProvider.symbol, {
      getDateSystem: () => FormulaDateSystem.Excel1900,
    });
  }
  if (adapters.createFunctionRegistry && !editorDIContainer.hasBinding(IFunctionRegistry.symbol)) {
    editorDIContainer.registerFactory(IFunctionRegistry.symbol, adapters.createFunctionRegistry, Scope.Singleton);
  }
  const embeddedEditor = options.embeddedEditor ?? new FakeSheetEmbeddedEditor();
  editorDIContainer.registerFactory(SheetEmbeddedEditor.symbol, () => embeddedEditor, Scope.Singleton);
  const pluginServiceContext: SheetPluginServiceContext = {
    container: editorDIContainer,
  };
  options.plugins?.forEach((implementation) => {
    editorDIContainer.register(implementation.symbol, implementation, Scope.Singleton);
    implementation.registerServices?.(pluginServiceContext);
  });

  const {
    renderContexts,
    rendererRegistry,
    scroller,
    scrollManager,
    embeddedEditor: runtimeEmbeddedEditor,
    pluginManager,
  } = registerEditorRuntime(editorDIContainer, adapters, viewport, configEngine.getDefaultConfig().devicePixelRatio);
  const ownsExternalServices = !editorDIContainer.hasBinding(IFormulaExternalServiceProvider.symbol);
  registerDefaultSheetFeatures(editorDIContainer, pluginManager, adapters, cloneSheetDocumentState(options.sheetState));
  if (ownsExternalServices) {
    const services = editorDIContainer.resolve<IFormulaExternalServiceProvider>(IFormulaExternalServiceProvider.symbol);
    const teardownToken = {};
    FormulaExternalServiceRegistry.prototype.enforceTeardownBoundary.call(services, teardownToken);
    lifecycle.add(() => services.destroy(teardownToken));
  }
  const selectionPlugin = editorDIContainer.resolve<SheetSelectionPlugin>(SheetSelectionPlugin.symbol);
  const customPlugins = registerConfiguredPlugins(editorDIContainer, pluginManager, options.plugins);
  const pluginSetupRuntime = createSheetPluginSetupRuntime({
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
  const pluginSetupContext: SheetPluginSetupContext = {
    container: editorDIContainer,
    runtime: pluginSetupRuntime,
    addStrategy(token, strategy, position): void {
      const manager = editorDIContainer.resolve<RenderStrategyManager<CellProperties>>(RenderStrategyManager.symbol);
      if ('before' in position) manager.addStrategyBefore(position.before, token, strategy);
      else manager.addStrategyAfter(position.after, token, strategy);
    },
  };
  const commands = editorDIContainer.resolve<SheetCommandBus>(SheetCommandBus.symbol);
  SheetInteractionStore.prototype.enforceCommandBoundary.call(pluginSetupRuntime.interaction.store,
    commands.isExecuting.bind(commands), commands.runWithoutMutationAuthority.bind(commands),
  );
  const queries = pluginSetupRuntime.queries;
  const observations = pluginSetupRuntime.observations;
  const cellVisualReaders = pluginSetupRuntime.render.cellVisualReaders;
  lifecycle.add(() => cellVisualReaders.destroy());
  registerSheetPluginCellVisualReaders(pluginManager.getAllPlugins(), cellVisualReaders, {
    readDefaultConfig(): Readonly<Record<string, unknown>> {
      return configEngine.getDefaultConfig() as unknown as Readonly<Record<string, unknown>>;
    },
  });
  pluginSetupRuntime.session.loadSnapshot(options.sessionState ?? {});
  registerSheetViewportSessionState(pluginSetupRuntime.session, scrollManager);
  registerSheetFormatTransfers(
    pluginManager.getAllPlugins(),
    editorDIContainer.resolve<SheetFormatTransferRegistry>(SheetFormatTransferRegistry.symbol),
  );
  registerSheetClipboardTransfers(
    pluginManager.getAllPlugins(),
    editorDIContainer.resolve<SheetClipboardTransferRegistry>(SheetClipboardTransferRegistry.symbol),
  );
  registerSheetPluginCommands(pluginManager.getAllPlugins(), commands);
  const rangeMoves = editorDIContainer.resolve<SheetRangeMoveRegistry>(SheetRangeMoveRegistry.symbol);
  registerSheetRangeMoves(pluginManager.getAllPlugins(), rangeMoves);
  const rangeReorders = editorDIContainer.resolve<SheetRangeReorderRegistry>(SheetRangeReorderRegistry.symbol);
  registerSheetRangeReorders(pluginManager.getAllPlugins(), rangeReorders);
  const structureMoves = editorDIContainer.resolve<SheetStructureMoveRegistry>(SheetStructureMoveRegistry.symbol);
  registerSheetStructureMoves(pluginManager.getAllPlugins(), structureMoves);
  registerSheetPluginQueries(pluginManager.getAllPlugins(), queries);
  registerSheetPluginObservations(pluginManager.getAllPlugins(), observations);
  registerSheetPluginSessionStates(pluginManager.getAllPlugins(), pluginSetupRuntime.session);
  registerSheetPluginCapabilities(pluginManager.getAllPlugins(), pluginSetupRuntime.extensions);
  pluginSetupRuntime.session.restorePhase(SessionStateRestorePhase.BeforeInitialize);
  customPlugins.forEach((plugin) => plugin.configure?.(pluginSetupContext));
  editorDIContainer.register(SearCore.symbol, SearCoreSheet, Scope.Singleton);
  const core = editorDIContainer.resolve<SearCoreSheet>(SearCore.symbol);
  editorDIContainer.resolve<DefaultSheetClipboardDataSource>(SheetClipboardDataSourceSymbol).bindPreviewRuntime(
    core,
    pluginManager,
    editorDIContainer.hasBinding(SheetClipboardWorkbookBridgeSymbol)
      ? editorDIContainer.resolve<SheetClipboardWorkbookBridge>(SheetClipboardWorkbookBridgeSymbol)
      : null,
  );
  SearCoreSheet.prototype.enforceCommandBoundary.call(core, commands.isExecuting.bind(commands));
  selectionPlugin.bindCore(core);
  let selectionTeardownDone = false;
  const disposeSelection = (): void => {
    if (selectionTeardownDone) return;
    selectionTeardownDone = true;
    selectionPlugin.onEditorDestroy();
  };
  lifecycle.add(disposeSelection);
  editorDIContainer.resolve<SheetCellEditorPlugin>(SheetCellEditorPlugin.symbol).bindCore(core);
  const disposeDisplayedValueRender = bindDisplayedValueRender(editorDIContainer, core);
  commands.bind({
    executePipeline: core.executePipeline.bind(core),
    applyEffect: () => void 0,
  });
  registerDefaultSheetStructureCommands(commands, dataEngine, structureMoves);
  const inputValidation = editorDIContainer.resolve<SheetCellInputValidationRegistry>(
    SheetCellInputValidationRegistry.symbol,
  );
  registerDefaultSheetRangeCommands(commands, dataEngine, inputValidation);
  registerSheetViewportCommands(
    commands,
    scrollManager,
    editorDIContainer.resolve<SheetViewportResizeController>(SheetViewportResizeController.symbol),
  );
  registerSheetConfigCommands(commands, configEngine);
  registerSheetInputValidationCommands(commands, inputValidation);
  registerSheetDisplayedValueCommands(
    commands,
    editorDIContainer.resolve<SheetDisplayedValueChanges>(SheetDisplayedValueChanges.symbol),
  );
  registerSheetStateSnapshotCommands(commands, pluginManager);
  registerSheetSessionStateCommands(commands, pluginSetupRuntime.session);
  pluginSetupRuntime.extensions.register(SheetRuntimeCapability.Commands, commands);
  pluginSetupRuntime.extensions.register(
    SheetRuntimeCapability.Toolbar,
    editorDIContainer.resolve<SearToolbar>(SearToolbar.symbol),
  );
  if (editorDIContainer.hasBinding(SearFormulaBar.symbol)) {
    const formulaBar = editorDIContainer.resolve<SearFormulaBar>(SearFormulaBar.symbol);
    pluginSetupRuntime.extensions.register(SheetRuntimeCapability.FormulaBar, formulaBar);
  }
  const pluginRuntime = {
    ...pluginSetupRuntime,
    commands: pluginSetupRuntime.extensions.require(SheetRuntimeCapability.Commands),
    toolbar: pluginSetupRuntime.extensions.require(SheetRuntimeCapability.Toolbar),
  };
  const pluginRuntimeContext: SheetPluginRuntimeContext = {
    ...pluginSetupContext,
    core,
    runtime: pluginRuntime,
  };
  const sessionLifecycleToken = {};
  lifecycle.add(() => pluginRuntime.session.clear(sessionLifecycleToken));
  const embeddedEditorTeardownToken = {};
  embeddedEditor.bindTeardownToken?.(embeddedEditorTeardownToken);
  lifecycle.add(() => embeddedEditor.dispose(embeddedEditorTeardownToken));
  lifecycle.add(() => pluginRuntime.extensions.destroy());
  const coreTeardownToken = {};
  lifecycle.add(() => core.destroy(coreTeardownToken));
  lifecycle.add(() => commands.destroy());
  const formulaScheduler = editorDIContainer.resolve<RecalcScheduler>(RecalcScheduler.symbol);
  const formulaSchedulerTeardownToken = {};
  formulaScheduler.bindTeardownToken(formulaSchedulerTeardownToken);
  lifecycle.add(() => formulaScheduler.dispose(formulaSchedulerTeardownToken));
  lifecycle.add(() => queries.destroy());
  lifecycle.add(() => observations.destroy());
  lifecycle.add(disposeDisplayedValueRender);
  lifecycle.add(() => {
    [...customPlugins].reverse().forEach((plugin) => plugin.onEditorDestroy?.(pluginRuntimeContext));
  });
  lifecycle.add(disposeSelection);
  core.initialize();
  pluginSetupRuntime.session.restorePhase(SessionStateRestorePhase.AfterInitialize);
  pluginSetupRuntime.session.sealRestoration(sessionLifecycleToken);
  customPlugins.forEach((plugin) => plugin.initialize?.(pluginRuntimeContext));
  lifecycle.add(
    bindSheetFormatPainterHighlight(
      editorDIContainer.resolve<SheetHighlightRegistry>(SheetHighlightRegistry.symbol),
      observations,
      pluginRuntime.input.cursor,
    ),
  );
  core.start();
  customPlugins.forEach((plugin) => plugin.start?.(pluginRuntimeContext));
  let extensionsTearingDown = false;
  lifecycle.add(() => { extensionsTearingDown = true; });
  const assertExtensionCommand = (): void => {
    if (!extensionsTearingDown && !commands.isExecuting()) {
      throw new SearContractViolationError('Sheet extensions must change through editor.commands.run(...).');
    }
  };
  const lifecycleCoordinator = editorDIContainer.resolve<SheetLifecycleCoordinator>(SheetLifecycleCoordinator.symbol);
  const lifecycleTeardownToken = {};
  lifecycle.add(() => lifecycleCoordinator.beginTeardown(lifecycleTeardownToken));
  SheetLifecycleCoordinator.prototype.enforceCommandBoundary.call(
    lifecycleCoordinator, assertExtensionCommand, lifecycleTeardownToken);
  SearCoreSheet.prototype.enforceTeardownBoundary.call(core, coreTeardownToken);
  EventEngine.prototype.enforceWriteBoundary.call(core.eventEngine, assertExtensionCommand, coreTeardownToken);
  EventRegistrar.prototype.enforceCommandBoundary.call(core.eventEngine.eventRegistrar, assertExtensionCommand);
  const collaborationBinding = editorDIContainer.resolve<CollaborationChannelBinding>(CollaborationChannelBinding.symbol);
  if (collaborationBinding.owner === 'editor') {
    CollaborationChannel.prototype.enforceCommandBoundary.call(collaborationBinding.channel,
      assertExtensionCommand, commands.runWithoutMutationAuthority.bind(commands),
      (event) => { commands.run(ApplySheetCollaborationEventCommand, event); },
    );
  }
  SheetQueryRegistry.prototype.enforceWriteBoundary.call(queries, assertExtensionCommand);
  ObservationRegistry.prototype.enforceWriteBoundary.call(observations,
    assertExtensionCommand, commands.runWithoutMutationAuthority.bind(commands), cloneSessionStateValue,
  );
  SheetDisplayedValueChanges.prototype.enforceCommandBoundary.call(
    editorDIContainer.resolve<SheetDisplayedValueChanges>(SheetDisplayedValueChanges.symbol),
    commands.isExecuting.bind(commands), commands.runWithoutMutationAuthority.bind(commands),
  );
  RuntimeCapabilityRegistry.prototype.enforceWriteBoundary.call(pluginRuntime.extensions, assertExtensionCommand);
  const cellCoordinator = editorDIContainer.resolve<SheetRenderCoordinatorManager>(SheetRenderCoordinatorManager.symbol);
  [
    pluginSetupRuntime.cells.catalog,
    editorDIContainer.resolve<CellCommitStrategyRegistry>(CellCommitStrategyRegistry.symbol),
    editorDIContainer.resolve<CellDisplayTextRegistry>(CellDisplayTextRegistry.symbol),
    editorDIContainer.resolve<CellClipboardCodecRegistry>(CellClipboardCodecRegistry.symbol),
    editorDIContainer.resolve<CellFormatTransferRegistry>(CellFormatTransferRegistry.symbol),
    editorDIContainer.resolve<CellFormulaValueConverterRegistry>(CellFormulaValueConverterRegistry.symbol),
    cellVisualReaders,
    cellCoordinator,
    cellCoordinator.nodeFactory,
    cellCoordinator.rendererRegistry,
  ].forEach((owner) => sealCellExtensionWrites(owner, assertExtensionCommand));
  [
    editorDIContainer.resolve<SheetFormatTransferRegistry>(SheetFormatTransferRegistry.symbol),
    editorDIContainer.resolve<SheetClipboardTransferRegistry>(SheetClipboardTransferRegistry.symbol),
    rangeMoves,
    rangeReorders,
    structureMoves,
    pluginSetupRuntime.interaction.reducers,
    pluginSetupRuntime.interaction.pipelineSteps,
    pluginSetupRuntime.input.cursorRules,
    editorDIContainer.resolve<SheetHighlightRegistry>(SheetHighlightRegistry.symbol),
  ].forEach((owner) => sealSheetContributionWrites(owner, assertExtensionCommand));
  RenderStrategyManager.prototype.enforceCommandBoundary.call(
    pluginSetupRuntime.render.strategies, commands.isExecuting.bind(commands));
  const inputValidationTeardownToken = {};
  lifecycle.add(() => inputValidation.beginTeardown(inputValidationTeardownToken));
  SheetCellInputValidationRegistry.prototype.enforceCommandBoundary.call(inputValidation, commands.isExecuting.bind(commands),
    (id) => commands.run(UnregisterSheetInputValidatorCommand, id), inputValidationTeardownToken);
  pluginManager.getAllPlugins().forEach((plugin) => {
    const prototypeMethod = Object.getPrototypeOf(plugin).sealRuntimeWrites as (() => void) | undefined;
    if (typeof prototypeMethod === 'function') prototypeMethod.call(plugin);
    else plugin.sealRuntimeWrites?.();
  });
  sealSheetPluginTeardownWrites(pluginManager.getAllPlugins(), assertExtensionCommand);
  SheetFormulaPlugin.prototype.enforceProviderCommandBoundary.call(
    editorDIContainer.resolve<SheetFormulaPlugin>(SheetFormulaPlugin.symbol),
    commands,
    editorDIContainer.hasBinding(FormulaRegistryOwnership.symbol)
      ? editorDIContainer.resolve<FormulaRegistryOwnership>(FormulaRegistryOwnership.symbol)
      : undefined,
  );
  ScrollManager.prototype.enforceCommandBoundary.call(scrollManager, commands.isExecuting.bind(commands));
  ConfigEngine.prototype.enforceCommandBoundary.call(configEngine, commands.isExecuting.bind(commands));
  if (pluginRuntime.extensions.has(SheetRuntimeCapability.FormulaBar)) {
    const formulaBar = pluginRuntime.extensions.require(SheetRuntimeCapability.FormulaBar);
    lifecycle.add(() => formulaBar.destroy());
  }
  let destroyed = false;
  const editor: SheetEditor = {
    commands,
    queries,
    observations,
    services: createRuntimeCapabilityReader(pluginRuntime.extensions, [
      SheetRuntimeCapability.Plugins,
      SheetRuntimeCapability.Data,
      SheetRuntimeCapability.Session,
      SheetRuntimeCapability.Interaction,
      SheetRuntimeCapability.Lifecycle,
    ]),
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      lifecycle.dispose();
    },
  };
  options.onCreated?.(editor);
  SheetCommandBus.prototype.enforceRegistrationBoundary.call(commands, assertExtensionCommand);
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
  const sheetGridPlugin = container.resolve<SheetGridPlugin>(SheetGridPlugin.symbol);
  const mergeRender = container.resolve<SheetCellMergeRender>(SheetCellMergeRender.symbol);
  const filter = container.resolve<SheetFilterPlugin>(SheetFilterPlugin.symbol);
  return changes.subscribe((cells) => {
    if (!filter.active) {
      const merges = readSheetCellMerges(core.getDataEngine());
      const changesMergedAnchor = merges && cells.some(({ row, column }) => {
        const anchor = merges.findRange(row, column)?.getPoint(0);
        return anchor?.[0] === row && anchor[1] === column;
      });
      if (!changesMergedAnchor) {
        core.requestRender(sheetGridPlugin);
        return;
      }
      const pipeline = new Pipeline('sheet.displayedValues');
      pipeline.addRender('sheet.displayedValues', sheetGridPlugin.key);
      pipeline.addRender('sheet.displayedValues', mergeRender.key);
      core.executePipeline(pipeline);
      return;
    }
    const pipeline = new Pipeline('sheet.filter.displayedValues');
    core.pluginManager.forEach((plugin) => pipeline.addRender('sheet.filter.displayedValues', plugin.key));
    core.executePipeline(pipeline);
  });
}

function registerConfiguredPlugins(
  container: Container,
  manager: PluginManager<SearCoreSheet, CellProperties>,
  implementations: SheetEditorPluginImplementation[] | undefined,
): SheetEditorPlugin[] {
  return (
    implementations?.map((implementation) => {
      const plugin = container.resolve<SheetEditorPlugin>(implementation.symbol);
      manager.registerPlugin(plugin);
      return plugin;
    }) ?? []
  );
}
