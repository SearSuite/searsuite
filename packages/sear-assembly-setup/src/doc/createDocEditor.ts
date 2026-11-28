import { DocCommandEffectRegistry } from '@searsuite/sear-assembly-commands';
import { ConfigEngine, type DocConfig, type EditorDefaultConfigOverrides } from '@searsuite/sear-assembly-config';
import { DocCompositionManager, DocCursorManager, SearCoreDoc } from '@searsuite/sear-assembly-core';
import { FocusDocCommand as importFocusDocCommand, registerDocPluginCommands } from '@searsuite/sear-assembly-doc';
import { prepareDocKernel } from '@searsuite/sear-assembly-doc-kernel';
import { EditorLifecycleStack, sealSheetContributionWrites } from '@searsuite/sear-assembly-plugin';
import { Container, Scope } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';
import { ViewExtensionBase } from '@searsuite/sear-render-event-engine';
import { KeyboardRouter, PointerCapture, TextInput } from '@searsuite/sear-render-input';
import { TextShaper } from '@searsuite/sear-render-metrics';
import { RichTextRunRenderRegistry } from '@searsuite/sear-render-node';
import { DefaultDocViews } from './DefaultDocViews';
import { DocCaretState } from './DocCaretState';
import { bindDocEditorCommandHost } from './DocEditorCommandHost';
import {
  type DocDocumentState,
  type DocEditor,
  type DocEditorAdapters,
  type DocEditorChange,
  type DocEditorConfiguration,
  type DocEditorContentRect,
  type DocEditorViewport,
  type DocSessionState,
} from './DocEditorContracts';
import { DocEditorLifecycleState } from './DocEditorLifecycleState';
import {
  type DocEditorRuntimeConfiguration,
  DocEditorRuntimeConfigurationSymbol,
} from './DocEditorRuntimeConfiguration';
import { DocInputAdapterLifecycle } from './DocInputAdapterLifecycle';
import { DocInputBindingRegistry } from './DocInputBindingRegistry';
import { DocPointerCoordinateMapper } from './DocPointerCoordinateMapper';
import { DocRenderCoordinator } from './DocRenderCoordinator';
import { DocRenderLayoutService } from './DocRenderLayoutService';
import { DocViewRuntimeCapability } from './DocViewCapabilities';
import { RenderDocCommand } from './DocViewCommands';
import {
  type DocView,
  DocViewCapability,
  type DocViewRuntime,
  type DocViewRuntimeContext,
  type DocViewSetupContext,
  registerDocPluginInlineStyleRenderers,
  registerDocPluginKeyboardHandlers,
} from './DocViewContracts';
import { registerDocViewportCommands, registerDocViewportState } from './DocViewportCommands';
import { DocViewportEnvironment } from './DocViewportEnvironment';
import { registerDocBaseServices } from './registerDocBaseServices';
import { registerDocRuntime } from './registerDocRuntime';

export type {
  DocDocumentState,
  DocEditor,
  DocEditorAdapters,
  DocEditorChange,
  DocEditorConfiguration,
  DocEditorContentRect,
  DocEditorViewport,
  DocSessionState,
};

/** Attaches document views and native adapters to the independent business assembly. */
export function createDocEditor(options: DocEditorConfiguration): DocEditor {
  const container = new Container(),
    lifecycle = new EditorLifecycleStack();
  lifecycle.add(() => container.reset());
  try {
    return assembleDocView(container, lifecycle, options);
  } catch (error) {
    disposeFailedDocEditor(lifecycle, error);
  }
}

function assembleDocView(
  container: Container,
  lifecycle: EditorLifecycleStack,
  options: DocEditorConfiguration,
): DocEditor {
  const viewport = options.viewport ?? { width: 800, height: 600 };
  const configuration: DocEditorRuntimeConfiguration = {
    initialViewport: viewport,
    resolveContentRect: options.contentRect ?? resolveDefaultDocContentRect,
  };
  container.registerInstance(DocEditorRuntimeConfigurationSymbol, configuration);
  const business = prepareDocKernel(
    container,
    lifecycle,
    {
      adapters: options.adapters,
      documentState: options.documentState,
      ...(options.sessionState === undefined ? {} : { sessionState: options.sessionState }),
      ...(options.defaultPlugins === undefined ? {} : { defaultPlugins: options.defaultPlugins }),
      ...(options.plugins === undefined ? {} : { plugins: options.plugins }),
    },
    createDocDefaultConfigOverrides(options),
  );
  registerDocBaseServices(container, options.adapters, viewport);
  const implementations = [
    ...(options.defaultViews === false ? [] : options.defaultViews ?? DefaultDocViews),
    ...(options.viewExtensions ?? []),
  ];
  for (const implementation of implementations) {
    container.register(implementation.symbol, implementation, Scope.Singleton);
    implementation.registerServices?.({ container });
  }
  const visual = registerDocRuntime(container, options.adapters, viewport);
  const core = container.resolve<SearCoreDoc>(SearCoreDoc.symbol);
  const { commands, observations, session, extensions, platform } = business.runtime;
  core.enforceViewCommandBoundary(commands.isExecuting.bind(commands));
  const cursor = container.resolve<DocCursorManager>(DocCursorManager.symbol),
    composition = container.resolve<DocCompositionManager>(DocCompositionManager.symbol),
    text = container.resolve<TextInput>(TextInput.symbol),
    bindings = container.resolve<DocInputBindingRegistry>(DocInputBindingRegistry.symbol),
    inputLifecycle = container.resolve<DocInputAdapterLifecycle>(DocInputAdapterLifecycle.symbol),
    viewportEnvironment = container.resolve<DocViewportEnvironment>(DocViewportEnvironment.symbol),
    renderCoordinator = container.resolve<DocRenderCoordinator>(DocRenderCoordinator.symbol),
    editorLifecycle = container.resolve<DocEditorLifecycleState>(DocEditorLifecycleState.symbol),
    runRenderers = container.resolve<RichTextRunRenderRegistry>(RichTextRunRenderRegistry.symbol);
  const runtime: DocViewRuntime = {
    ...business.runtime,
    textShaper: container.resolve<TextShaper>(TextShaper.symbol),
    render: { engine: visual.renderEngine, context: visual.renderContexts.main },
    events: { engine: visual.eventEngine, registrar: visual.eventRegistrar },
    input: {
      text,
      keyboard: container.resolve<KeyboardRouter>(KeyboardRouter.symbol),
      pointer: container.resolve<PointerCapture>(PointerCapture.symbol),
    },
    scroll: { manager: visual.scrollManager },
    document: { ...business.runtime.document, core, cursor },
  };
  const views = implementations.map((implementation) => container.resolve<DocView>(implementation.symbol));
  const registry = core.getViewExtensions();
  for (const view of views) registry.register(view);
  extensions.register(DocViewCapability.Config, container.resolve<ConfigEngine>(ConfigEngine.symbol));
  extensions.register(DocViewCapability.TextShaper, runtime.textShaper);
  extensions.register(DocViewCapability.Render, runtime.render);
  extensions.register(DocViewCapability.Events, runtime.events);
  extensions.register(DocViewCapability.Input, runtime.input);
  extensions.register(DocViewCapability.Scroll, runtime.scroll);
  extensions.register(
    DocViewCapability.LayoutService,
    container.resolve<DocRenderLayoutService>(DocRenderLayoutService.symbol),
  );
  extensions.register(DocViewRuntimeCapability.Composition, composition);
  extensions.register(DocViewRuntimeCapability.InputBindings, bindings);
  extensions.register(
    DocViewRuntimeCapability.Interaction,
    container.resolve<DocPointerCoordinateMapper>(DocPointerCoordinateMapper.symbol),
  );
  const setup: DocViewSetupContext = { container, runtime };
  for (const view of views) view.configure?.(setup);
  lifecycle.add(registerDocPluginInlineStyleRenderers(views, runRenderers));
  lifecycle.add(registerDocPluginCommands(views, commands));
  lifecycle.add(registerDocPluginKeyboardHandlers(views, { bindings, commands }));
  registerDocViewportState(session, observations, visual.scrollManager);
  lifecycle.add(
    bindDocEditorCommandHost({
      effects: container.resolve(DocCommandEffectRegistry.symbol),
      textInput: text,
      extensions,
    }),
  );
  registerDocViewportCommands({
    commands,
    viewportEnvironment,
    renderCoordinator,
    scrollManager: visual.scrollManager,
  });
  renderCoordinator.bind();
  viewportEnvironment.start();
  inputLifecycle.start();
  const context: DocViewRuntimeContext = { ...setup, core };
  lifecycle.add(() => {
    for (const view of [...views].reverse()) view.destroyView?.();
  });
  const coreToken = {},
    eventToken = {},
    cursorToken = {},
    viewportToken = {},
    inputToken = {},
    renderToken = {};
  lifecycle.add(() => core.destroyView(coreToken));
  lifecycle.add(() => visual.eventEngine.destroy(eventToken));
  lifecycle.add(() => cursor.clearCursor(cursorToken));
  lifecycle.add(() => viewportEnvironment.destroy(viewportToken));
  lifecycle.add(() => inputLifecycle.destroy(inputToken));
  lifecycle.add(() => renderCoordinator.destroy(renderToken));
  business.initialize();
  core.initialize();
  if (commands.has(RenderDocCommand)) commands.run(RenderDocCommand, void 0);
  for (const view of views) view.initialize?.(context);
  core.start();
  for (const view of views) view.start?.(context);
  business.start();
  let tearingDown = false;
  lifecycle.add(() => {
    tearingDown = true;
    business.beginTeardown();
  });
  const assertViewWrite = (): void => {
    if (!tearingDown && !commands.isExecuting())
      throw new SearError('Doc views must change through editor.commands.run(...).');
  };
  for (const view of views) ViewExtensionBase.prototype.enforceRuntimeWriteBoundary.call(view, assertViewWrite);
  sealSheetContributionWrites(registry, assertViewWrite);
  runRenderers.enforceWriteBoundary(assertViewWrite);
  bindings.enforceCommandBoundary(commands.isExecuting.bind(commands), () => tearingDown);
  inputLifecycle.enforceLifecycleBoundary(assertViewWrite, inputToken);
  core.enforceViewTeardownBoundary(coreToken);
  visual.eventEngine.enforceWriteBoundary(assertViewWrite, eventToken);
  visual.eventEngine.eventRegistrar.enforceCommandBoundary(assertViewWrite);
  core.blockManager.enforceCommandBoundary(commands.isExecuting.bind(commands));
  viewportEnvironment.enforceTeardownBoundary(viewportToken);
  renderCoordinator.enforceTeardownBoundary(renderToken);
  if (container.hasBinding(DocCaretState.symbol))
    container.resolve<DocCaretState>(DocCaretState.symbol).enforceCommandBoundary(commands.isExecuting.bind(commands));
  composition.enforceCommandBoundary(commands.isExecuting.bind(commands));
  cursor.enforceCommandBoundary(commands.isExecuting.bind(commands), cursorToken);
  visual.scrollManager.enforceCommandBoundary(commands.isExecuting.bind(commands));
  business.seal();
  const editor: DocEditor = {
    ...business.editor,
    focus(): void {
      commands.run(importFocusDocCommand, void 0);
    },
    render(): void {
      if (!editorLifecycle.isDestroyed()) commands.run(RenderDocCommand, void 0);
    },
    destroy(): void {
      if (editorLifecycle.isDestroyed()) return;
      editorLifecycle.markDestroyed();
      business.editor.destroy();
    },
  };
  options.onCreated?.(editor);
  business.sealCommands();
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
