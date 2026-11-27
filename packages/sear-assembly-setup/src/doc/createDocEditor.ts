import { sealSheetContributionWrites } from '@searsuite/sear-assembly-plugin';
import { ViewExtensionBase } from '@searsuite/sear-render-event-engine';

import { DefaultDocViews } from './DefaultDocViews';
import { type DocView, type DocViewRuntime, type DocViewSetupContext, type DocViewRuntimeContext, DocViewCapability } from './DocViewContracts';
import { ConfigEngine, type DocConfig, type EditorDefaultConfigOverrides } from '@searsuite/sear-assembly-config';
import { DocCompositionManager, DocCursorManager, SearCoreDoc } from '@searsuite/sear-assembly-core';
import { DocInputPlugin } from '@searsuite/sear-assembly-doc';
import { SearContractViolationError } from '@searsuite/sear-assembly-plugin';
import { DocCommandBus } from '@searsuite/sear-assembly-commands';
import { DocNodeRegistry, RichTextInlineStyleRegistry, RichTextLineBoxRegistry, RichTextBlockFlowRegistry } from '@searsuite/sear-domain-doc';
import { DocLayoutEngine } from '@searsuite/sear-domain-editor';
import { Container, Scope } from '@searsuite/sear-foundation-di';
import { cloneSessionStateValue, createRuntimeCapabilityReader, EditorLifecycleStack, SessionStateRegistry, SessionStateRestorePhase } from '@searsuite/sear-assembly-plugin';
import { ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { Platform } from '@searsuite/sear-foundation-platform';
import { TextShaper } from '@searsuite/sear-render-metrics';
import { KeyboardRouter, PointerCapture, TextInput } from '@searsuite/sear-render-input';
import { RichTextRunRenderRegistry } from '@searsuite/sear-render-node';
import { DocRuntimeCapability, registerDocPluginCommands, registerDocPluginCapabilities, registerDocPluginInlineStyles, registerDocPluginLineBoxes, registerDocPluginBlockFlows, registerDocPluginObservations, registerDocPluginSessionStates, type DocPlugin, type DocPluginImplementation, type DocPluginRuntime, type DocPluginRuntimeContext, type DocPluginServiceContext, type DocPluginSetupContext } from '@searsuite/sear-assembly-doc';
import { registerDocPluginKeyboardHandlers, registerDocPluginInlineStyleRenderers } from '../index';
import { DocRuntimeExtensionRegistry } from '@searsuite/sear-assembly-doc';
import { registerDocBaseServices } from './registerDocBaseServices';
import { registerDocRuntime } from './registerDocRuntime';
import { registerDefaultDocFeatures, registerDocFeaturePlugins } from './registerDefaultDocFeatures';
import { DefaultDocFeaturePlugins } from './DefaultDocFeaturePlugins';
import { DocInputBindingRegistry } from './DocInputBindingRegistry';
import { DocViewRuntimeCapability } from './DocViewCapabilities';
import { createDocEditorApi } from './DocEditorApi';
import { bindDocEditorCommandHost } from './DocEditorCommandHost';
import { DocDocumentSessionCoordinator } from './DocDocumentSessionCoordinator';
import { sealDocPluginTeardownWrites } from './sealDocPluginTeardownWrites';
import { DocCaretState } from './DocCaretState';
import { DocInputAdapterLifecycle } from './DocInputAdapterLifecycle';
import { DocPointerCoordinateMapper } from './DocPointerCoordinateMapper';
import { DocRenderCoordinator } from './DocRenderCoordinator';
import { DocRenderLayoutService } from './DocRenderLayoutService';
import { DocViewportEnvironment } from './DocViewportEnvironment';
import { DocEditorLifecycleState } from './DocEditorLifecycleState';
import { registerDocViewportCommands } from './DocViewportCommands';
import { registerDocConfigCommands } from './DocConfigCommands';
import { registerDocViewportState } from './DocViewportCommands';
import { registerDocDocumentObservation } from './DocStateObservations';
import { registerDocInlineStyleObservation } from './DocInlineStyleObservations';
import { registerDocSessionStateCommands } from './DocSessionStateCommands';
import { registerDocStateSnapshotCommands } from './DocStateSnapshotCommands';
import { RenderDocCommand } from './DocViewCommands';
import { type DocEditorRuntimeConfiguration, DocEditorRuntimeConfigurationSymbol } from './DocEditorRuntimeConfiguration';
import { type DocEditor, type DocEditorAdapters, type DocEditorChange, type DocEditorConfiguration, type DocEditorContentRect, type DocDocumentState, type DocSessionState, type DocEditorViewport } from './DocEditorContracts';

export type {
  DocEditor,
  DocEditorAdapters,
  DocEditorChange,
  DocEditorConfiguration,
  DocEditorContentRect,
  DocDocumentState,
  DocSessionState,
  DocEditorViewport,
} from './DocEditorContracts';

/**
 * Assembles a standalone rich-document editor from platform-neutral adapters and document content.
 *
 * The editor owns its DI container, selected document plugins, rendering
 * services, input adapters, and lifecycle. Product chrome remains a host
 * concern and communicates with the editor through its public facade.
 *
 * @param options Platform adapters, initial document state, plugins, and viewport configuration.
 * @returns A fully initialized rich-document editor facade.
 * @example
 * ```ts
 * const editor = createDocEditor({ adapters, documentState });
 * editor.focus();
 * editor.destroy();
 * ```
 */
export function createDocEditor(options: DocEditorConfiguration): DocEditor {
  const editorDIContainer = new Container();
  const resourceLifecycle = new EditorLifecycleStack();
  resourceLifecycle.add(() => editorDIContainer.reset());
  try {
    return assembleDocEditor(editorDIContainer, resourceLifecycle, options);
  } catch (error) {
    disposeFailedDocEditor(resourceLifecycle, error);
  }
}

function assembleDocEditor(
  editorDIContainer: Container,
  resourceLifecycle: EditorLifecycleStack,
  options: DocEditorConfiguration,
): DocEditor {
  const viewport = options.viewport ?? { width: 800, height: 600 };
  const resolveContentRect = options.contentRect ?? resolveDefaultDocContentRect;

  const runtimeConfiguration: DocEditorRuntimeConfiguration = {
    initialViewport: viewport,
    resolveContentRect,
  };
  editorDIContainer.registerInstance(DocEditorRuntimeConfigurationSymbol, runtimeConfiguration);
  const defaultPluginImplementations: DocPluginImplementation<DocPlugin<unknown>>[] =
    options.defaultPlugins === false ? [] : [...(options.defaultPlugins ?? DefaultDocFeaturePlugins)];
  const customPlugins = options.plugins ?? [];
  const viewImplementations = [
    ...(options.defaultViews === false ? [] : options.defaultViews ?? DefaultDocViews),
    ...(options.viewExtensions ?? []),
  ];
  const docPluginImplementations = [...defaultPluginImplementations, ...customPlugins];
  registerDocBaseServices(editorDIContainer, options.adapters, viewport, createDocDefaultConfigOverrides(options));
  options.adapters.registerEnvironment?.(editorDIContainer);
  const pluginServiceContext: DocPluginServiceContext = { container: editorDIContainer };
  docPluginImplementations.forEach(function registerDocPluginService(implementation) {
    editorDIContainer.register(implementation.symbol, implementation, Scope.Singleton);
    implementation.registerServices?.(pluginServiceContext);
  });
  for (const implementation of viewImplementations) {
    editorDIContainer.register(implementation.symbol, implementation, Scope.Singleton);
    implementation.registerServices?.(pluginServiceContext);
  }
  const runtime = registerDocRuntime(editorDIContainer, options.adapters, viewport);

  const renderContext = runtime.renderContexts.main;
  const platform = editorDIContainer.resolve<Platform>(Platform.symbol);
  const textInput = editorDIContainer.resolve<TextInput>(TextInput.symbol);
  const keyboardRouter = editorDIContainer.resolve<KeyboardRouter>(KeyboardRouter.symbol);
  const pointerCapture = editorDIContainer.resolve<PointerCapture>(PointerCapture.symbol);
  const scrollManager = runtime.scrollManager;
  const cursorManager = editorDIContainer.resolve<DocCursorManager>(DocCursorManager.symbol);
  const compositionManager = editorDIContainer.resolve<DocCompositionManager>(DocCompositionManager.symbol);
  const inlineStyleRegistry = editorDIContainer.resolve<RichTextInlineStyleRegistry>(
    RichTextInlineStyleRegistry.symbol,
  );
  const runRenderRegistry = editorDIContainer.resolve<RichTextRunRenderRegistry>(RichTextRunRenderRegistry.symbol);
  const lineBoxRegistry = editorDIContainer.resolve<RichTextLineBoxRegistry>(RichTextLineBoxRegistry.symbol);
  const blockFlowRegistry = editorDIContainer.resolve<RichTextBlockFlowRegistry>(RichTextBlockFlowRegistry.symbol);
  const searCoreDoc = editorDIContainer.resolve<SearCoreDoc>(SearCoreDoc.symbol);
  const renderEngine = runtime.renderEngine;
  const commands = editorDIContainer.resolve<DocCommandBus>(DocCommandBus.symbol);
  searCoreDoc.enforceCommandBoundary(
    commands.isExecuting.bind(commands),
    commands.runWithoutMutationAuthority.bind(commands),
  );
  const inputBindings = editorDIContainer.resolve<DocInputBindingRegistry>(DocInputBindingRegistry.symbol);
  let inputBindingsTearingDown = false;
  const lifecycle = editorDIContainer.resolve<DocEditorLifecycleState>(DocEditorLifecycleState.symbol);
  const observations = editorDIContainer.resolve<ObservationRegistry>(ObservationRegistry.symbol);
  const session = editorDIContainer.resolve<SessionStateRegistry>(SessionStateRegistry.symbol);

  function isDocEditorDestroyed(): boolean {
    return lifecycle.isDestroyed();
  }

  function markDocEditorDestroyed(): void {
    lifecycle.markDestroyed();
  }

  const inputPlugin = editorDIContainer.resolve<DocInputPlugin>(DocInputPlugin.symbol);
  searCoreDoc.registerPlugin(inputPlugin);
  const sessionCoordinator = editorDIContainer.resolve<DocDocumentSessionCoordinator>(
    DocDocumentSessionCoordinator.symbol,
  );
  const inputLifecycle = editorDIContainer.resolve<DocInputAdapterLifecycle>(DocInputAdapterLifecycle.symbol);
  const viewportEnvironment = editorDIContainer.resolve<DocViewportEnvironment>(DocViewportEnvironment.symbol);
  const pointerMapper = editorDIContainer.resolve<DocPointerCoordinateMapper>(DocPointerCoordinateMapper.symbol);

  const extensions = editorDIContainer.resolve<DocRuntimeExtensionRegistry>(DocRuntimeExtensionRegistry.symbol);
  const viewRuntime: DocViewRuntime = {
    extensions,
    platform,
    commands,
    observations,
    session,
    plugins: runtime.pluginManager,
    textShaper: editorDIContainer.resolve<TextShaper>(TextShaper.symbol),
    render: {
      engine: renderEngine,
      context: renderContext,
    },
    events: {
      engine: runtime.eventEngine,
      registrar: runtime.eventRegistrar,
    },
    input: {
      text: textInput,
      keyboard: keyboardRouter,
      pointer: pointerCapture,
    },
    scroll: {
      manager: scrollManager,
    },
    document: {
      core: searCoreDoc,
      nodes: editorDIContainer.resolve<DocNodeRegistry>(DocNodeRegistry.symbol),
      layout: editorDIContainer.resolve<DocLayoutEngine>(DocLayoutEngine.symbol),
      cursor: cursorManager,
      inlineStyles: inlineStyleRegistry,
      lineBoxes: lineBoxRegistry,
      blockFlows: blockFlowRegistry,
      input: inputPlugin,
    },
  };
  const pluginRuntime: DocPluginRuntime = {
    extensions,
    platform,
    commands,
    observations,
    session,
    plugins: runtime.pluginManager,
    document: {
      input: inputPlugin,
      nodes: viewRuntime.document.nodes,
      layout: viewRuntime.document.layout,
      inlineStyles: inlineStyleRegistry,
      lineBoxes: lineBoxRegistry,
      blockFlows: blockFlowRegistry,
    },
  };
  const docViews = viewImplementations.map((implementation) =>
    editorDIContainer.resolve<DocView>(implementation.symbol),
  );
  const viewRegistry = searCoreDoc.getViewExtensions();
  for (const view of docViews) viewRegistry.register(view);
  const viewSetupContext: DocViewSetupContext = { container: editorDIContainer, runtime: viewRuntime };
  extensions.register(DocRuntimeCapability.Platform, platform);
  extensions.register(DocViewCapability.Config, editorDIContainer.resolve<ConfigEngine>(ConfigEngine.symbol));
  extensions.register(DocRuntimeCapability.Commands, commands);
  extensions.register(DocRuntimeCapability.Observations, observations);
  extensions.register(DocRuntimeCapability.Session, session);
  extensions.register(DocRuntimeCapability.Plugins, runtime.pluginManager);
  extensions.register(DocViewCapability.TextShaper, viewRuntime.textShaper);
  extensions.register(DocViewCapability.Render, viewRuntime.render);
  extensions.register(DocViewCapability.Events, viewRuntime.events);
  extensions.register(DocViewCapability.Input, viewRuntime.input);
  extensions.register(DocViewCapability.Scroll, viewRuntime.scroll);
  extensions.register(DocRuntimeCapability.Document, pluginRuntime.document);
  extensions.register(DocRuntimeCapability.InlineStyles, inlineStyleRegistry);
  extensions.register(DocRuntimeCapability.LineBoxes, lineBoxRegistry);
  extensions.register(DocRuntimeCapability.BlockFlows, blockFlowRegistry);
  extensions.register(
    DocViewCapability.LayoutService,
    editorDIContainer.resolve<DocRenderLayoutService>(DocRenderLayoutService.symbol),
  );
  extensions.register(DocViewRuntimeCapability.Composition, compositionManager);
  extensions.register(DocViewRuntimeCapability.InputBindings, inputBindings);
  extensions.register(DocViewRuntimeCapability.Interaction, pointerMapper);
  for (const view of docViews) view.configure?.(viewSetupContext);

  const defaultDocPlugins = registerDefaultDocFeatures(
    editorDIContainer,
    runtime.pluginManager,
    options.defaultPlugins,
  );
  const customDocPlugins = registerDocFeaturePlugins(editorDIContainer, runtime.pluginManager, customPlugins);
  const docPlugins = [...defaultDocPlugins, ...customDocPlugins];
  const unregisterDocPluginInlineStyles = registerDocPluginInlineStyles(docPlugins, inlineStyleRegistry);
  resourceLifecycle.add(unregisterDocPluginInlineStyles);
  const disposeDocPluginInlineStyleRenderers = registerDocPluginInlineStyleRenderers(docViews, runRenderRegistry);
  resourceLifecycle.add(disposeDocPluginInlineStyleRenderers);
  const unregisterDocPluginLineBoxes = registerDocPluginLineBoxes(docPlugins, lineBoxRegistry);
  resourceLifecycle.add(unregisterDocPluginLineBoxes);
  const unregisterDocPluginBlockFlows = registerDocPluginBlockFlows(docPlugins, blockFlowRegistry);
  resourceLifecycle.add(unregisterDocPluginBlockFlows);
  const pluginSetupContext: DocPluginSetupContext = {
    container: editorDIContainer,
    runtime: pluginRuntime,
  };
  docPlugins.forEach(function configureDocPlugin(plugin) {
    plugin.configure?.(pluginSetupContext);
  });
  const registeredPlugins = runtime.pluginManager.getAllPlugins();
  const unregisterDocPluginCommands = registerDocPluginCommands([...registeredPlugins, ...docViews], commands);
  const unregisterDocPluginKeyboardHandlers = registerDocPluginKeyboardHandlers(docViews, {
    bindings: inputBindings,
    commands,
  });
  registerDocPluginObservations(registeredPlugins, observations);
  registerDocPluginSessionStates(registeredPlugins, session);
  registerDocPluginCapabilities(registeredPlugins, extensions);
  registerDocDocumentObservation(observations, sessionCoordinator);
  registerDocInlineStyleObservation(observations, inputPlugin, inlineStyleRegistry);
  registerDocViewportState(session, observations, scrollManager);
  session.loadSnapshot(options.sessionState ?? {});
  const sessionLifecycleToken = {};
  sessionCoordinator.loadDocument(options.documentState.document);
  session.restorePhase(SessionStateRestorePhase.BeforeInitialize);

  const renderCoordinator = editorDIContainer.resolve<DocRenderCoordinator>(DocRenderCoordinator.symbol);
  bindDocEditorCommandHost({ commands, searCoreDoc, textInput, extensions });
  registerDocViewportCommands({
    commands,
    viewportEnvironment,
    renderCoordinator,
    scrollManager,
  });
  registerDocConfigCommands(commands, editorDIContainer.resolve<ConfigEngine<DocConfig>>(ConfigEngine.symbol));
  registerDocStateSnapshotCommands(commands, sessionCoordinator);
  registerDocSessionStateCommands(commands, session);
  renderCoordinator.bind();
  viewportEnvironment.start();
  inputLifecycle.start();

  const viewRuntimeContext: DocViewRuntimeContext = { ...viewSetupContext, core: searCoreDoc };
  resourceLifecycle.add(() => {
    for (const view of [...docViews].reverse()) view.destroyView?.();
  });
  const pluginRuntimeContext: DocPluginRuntimeContext = {
    ...pluginSetupContext,
  };
  resourceLifecycle.add(() => extensions.destroy());
  const coreTeardownToken = {};
  resourceLifecycle.add(() => searCoreDoc.destroy(coreTeardownToken));
  const eventTeardownToken = {};
  resourceLifecycle.add(() => runtime.eventEngine.destroy(eventTeardownToken));
  resourceLifecycle.add(() => commands.destroy());
  resourceLifecycle.add(() => session.clear(sessionLifecycleToken));
  resourceLifecycle.add(() => observations.destroy());
  resourceLifecycle.add(unregisterDocPluginCommands);
  resourceLifecycle.add(unregisterDocPluginKeyboardHandlers);
  const cursorTeardownToken = {};
  resourceLifecycle.add(() => cursorManager.clearCursor(cursorTeardownToken));
  const viewportTeardownToken = {};
  resourceLifecycle.add(() => viewportEnvironment.destroy(viewportTeardownToken));
  const inputLifecycleTeardownToken = {};
  resourceLifecycle.add(() => inputLifecycle.destroy(inputLifecycleTeardownToken));
  const renderTeardownToken = {};
  resourceLifecycle.add(() => renderCoordinator.destroy(renderTeardownToken));
  resourceLifecycle.add(() => {
    [...docPlugins].reverse().forEach((plugin) => plugin.onEditorDestroy?.(pluginRuntimeContext));
  });
  searCoreDoc.initialize();
  if (commands.has(RenderDocCommand)) commands.run(RenderDocCommand, void 0);
  session.restorePhase(SessionStateRestorePhase.AfterInitialize);
  session.sealRestoration(sessionLifecycleToken);
  inputPlugin.sealSessionRestoration();
  docPlugins.forEach(function initializeDocPlugin(plugin) {
    plugin.initialize?.(pluginRuntimeContext);
  });

  const editor = createDocEditorApi({
    commands,
    observations,
    services: createRuntimeCapabilityReader(extensions, [
      DocRuntimeCapability.Plugins,
      DocRuntimeCapability.Document,
      DocRuntimeCapability.Session,
    ]),
    session: sessionCoordinator,
    dispose: () => resourceLifecycle.dispose(),
    isDestroyed: isDocEditorDestroyed,
    markDestroyed: markDocEditorDestroyed,
  });

  for (const view of docViews) view.initialize?.(viewRuntimeContext);
  searCoreDoc.start();
  for (const view of docViews) view.start?.(viewRuntimeContext);
  docPlugins.forEach(function startDocPlugin(plugin) {
    plugin.start?.(pluginRuntimeContext);
  });
  let extensionsTearingDown = false;
  resourceLifecycle.add(() => {
    extensionsTearingDown = true;
  });
  resourceLifecycle.add(() => {
    inputBindingsTearingDown = true;
  });
  const assertExtensionCommand = (): void => {
    if (!extensionsTearingDown && !commands.isExecuting()) {
      throw new SearContractViolationError('Doc extensions must change through editor.commands.run(...).');
    }
  };
  sealDocPluginTeardownWrites(docPlugins, assertExtensionCommand);
  for (const view of docViews)
    ViewExtensionBase.prototype.enforceRuntimeWriteBoundary.call(view, assertExtensionCommand);
  sealSheetContributionWrites(viewRegistry, assertExtensionCommand);
  inlineStyleRegistry.enforceWriteBoundary(assertExtensionCommand);
  runRenderRegistry.enforceWriteBoundary(assertExtensionCommand);
  lineBoxRegistry.enforceWriteBoundary(assertExtensionCommand);
  blockFlowRegistry.enforceWriteBoundary(assertExtensionCommand);
  observations.enforceWriteBoundary(
    assertExtensionCommand,
    commands.runWithoutMutationAuthority.bind(commands),
    cloneSessionStateValue,
  );
  extensions.enforceWriteBoundary(assertExtensionCommand);
  inputBindings.enforceCommandBoundary(commands.isExecuting.bind(commands), () => inputBindingsTearingDown);
  inputLifecycle.enforceLifecycleBoundary(assertExtensionCommand, inputLifecycleTeardownToken);
  searCoreDoc.enforceTeardownBoundary(coreTeardownToken);
  runtime.eventEngine.enforceWriteBoundary(assertExtensionCommand, eventTeardownToken);
  runtime.eventEngine.eventRegistrar.enforceCommandBoundary(assertExtensionCommand);
  searCoreDoc.blockManager.enforceCommandBoundary(commands.isExecuting.bind(commands));
  viewportEnvironment.enforceTeardownBoundary(viewportTeardownToken);
  renderCoordinator.enforceTeardownBoundary(renderTeardownToken);
  if (editorDIContainer.hasBinding(DocCaretState.symbol)) {
    editorDIContainer
      .resolve<DocCaretState>(DocCaretState.symbol)
      .enforceCommandBoundary(commands.isExecuting.bind(commands));
  }
  compositionManager.enforceCommandBoundary(commands.isExecuting.bind(commands));
  cursorManager.enforceCommandBoundary(commands.isExecuting.bind(commands), cursorTeardownToken);
  scrollManager.enforceCommandBoundary(commands.isExecuting.bind(commands));
  editorDIContainer
    .resolve<ConfigEngine>(ConfigEngine.symbol)
    .enforceCommandBoundary(commands.isExecuting.bind(commands));
  options.onCreated?.(editor);
  commands.enforceRegistrationBoundary(assertExtensionCommand);
  return editor;
}

function disposeFailedDocEditor(lifecycle: EditorLifecycleStack, setupError: unknown): never {
  try {
    lifecycle.dispose();
  } catch (cleanupError) {
    throw new AggregateError([setupError, cleanupError], 'DocEditor setup and cleanup both failed.');
  }
  throw setupError;
}

function createDocDefaultConfigOverrides(options: DocEditorConfiguration): EditorDefaultConfigOverrides<DocConfig> {
  return {
    devicePixelRatio: options.devicePixelRatio ?? 1,
    ...(options.fontSize === undefined ? {} : { docFontSize: options.fontSize }),
    ...(options.fontFamily === undefined ? {} : { docFontFamily: options.fontFamily }),
    ...(options.lineHeightMultiplier === undefined ? {} : { docLineHeightMultiplier: options.lineHeightMultiplier }),
    ...(options.paragraphSpacingAfter === undefined ? {} : { docParagraphSpacingAfter: options.paragraphSpacingAfter }),
    ...(options.verticalAlign === undefined ? {} : { docVerticalAlign: options.verticalAlign }),
    ...(options.incrementalRenderPolicyLimits === undefined
      ? {}
      : { incrementalRenderPolicyLimits: options.incrementalRenderPolicyLimits }),
  };
}

function resolveDefaultDocContentRect(currentViewport: DocEditorViewport): DocEditorContentRect {
  return {
    x: 0,
    y: 0,
    width: currentViewport.width,
    height: currentViewport.height,
  };
}
