import { DocCommandBus, DocCommandEffectRegistry, DocQueryRegistry } from '@searsuite/sear-assembly-commands';
import { ConfigEngine, type DocConfig, type EditorDefaultConfigOverrides } from '@searsuite/sear-assembly-config';
import {
  DocInputPlugin,
  DocRuntimeCapability,
  DocRuntimeExtensionRegistry,
  LoadDocumentCommand,
  registerDocPluginBlockFlows,
  registerDocPluginCapabilities,
  registerDocPluginCommands,
  registerDocPluginInlineStyles,
  registerDocPluginLineBoxes,
  registerDocPluginObservations,
  registerDocPluginSessionStates,
  type DocPlugin,
  type DocPluginImplementation,
  type DocPluginRuntime,
  type DocPluginSetupContext,
} from '@searsuite/sear-assembly-doc';
import {
  EditorLifecycleStack,
  PluginManager,
  SessionStateRegistry,
  SessionStateRestorePhase,
  cloneSessionStateValue,
  createRuntimeCapabilityReader,
  sealSheetContributionWrites,
} from '@searsuite/sear-assembly-plugin';
import {
  DocNodeRegistry,
  RichTextBlockFlowRegistry,
  RichTextInlineStyleRegistry,
  RichTextLineBoxRegistry,
} from '@searsuite/sear-domain-doc';
import { DocLayoutEngine } from '@searsuite/sear-domain-editor';
import { Scope, type Container } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';
import { Platform } from '@searsuite/sear-foundation-platform';
import { ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { DefaultDocFeaturePlugins } from './DefaultDocFeaturePlugins';
import { DocCommitObservation } from './DocCommitObservation';
import { registerDocConfigCommands } from './DocConfigCommands';
import { DocDocumentSessionCoordinator } from './DocDocumentSessionCoordinator';
import { registerDocInlineStyleObservation } from './DocInlineStyleObservations';
import { DocKernel } from './DocKernel';
import { type DocKernelConfiguration, type DocKernelEditor } from './DocKernelContracts';
import { registerDocSessionStateCommands } from './DocSessionStateCommands';
import { registerDocDocumentObservation } from './DocStateObservations';
import { ReadDocDocumentQuery, ReadDocSelectionQuery, ReadDocTextQuery } from './DocStateQueries';
import { registerDocStateSnapshotCommands } from './DocStateSnapshotCommands';
import { registerDocKernelServices } from './registerDocKernelServices';
import { sealDocPluginTeardownWrites } from './sealDocPluginTeardownWrites';

/** Assembly-owned lifecycle shared by document hosts without exposing a service locator to callers. */
export interface DocKernelAssembly {
  readonly kernel: DocKernel;
  readonly runtime: DocPluginRuntime;
  readonly editor: DocKernelEditor;
  initialize(): void;
  start(): void;
  seal(): void;
  sealCommands(): void;
  beginTeardown(): void;
}

/** Composes the single document business runtime before optional presentation is attached. */
export function prepareDocKernel(
  container: Container,
  lifecycle: EditorLifecycleStack,
  options: DocKernelConfiguration,
  configOverrides?: EditorDefaultConfigOverrides<DocConfig>,
): DocKernelAssembly {
  registerDocKernelServices(container, options.adapters, configOverrides);
  options.adapters.registerEnvironment?.(container);
  const implementations: DocPluginImplementation<DocPlugin<unknown>>[] = [
    ...(options.defaultPlugins === false ? [] : options.defaultPlugins ?? DefaultDocFeaturePlugins),
    ...(options.plugins ?? []),
  ];
  for (const implementation of implementations) {
    container.register(implementation.symbol, implementation, Scope.Singleton);
    implementation.registerServices?.({ container });
  }
  const platform = container.resolve<Platform>(Platform.symbol),
    manager = container.resolve<PluginManager>(PluginManager.symbol),
    input = container.resolve<DocInputPlugin>(DocInputPlugin.symbol),
    kernel = container.resolve<DocKernel>(DocKernel.symbol),
    commands = container.resolve<DocCommandBus>(DocCommandBus.symbol),
    queries = container.resolve<DocQueryRegistry>(DocQueryRegistry.symbol),
    effects = container.resolve<DocCommandEffectRegistry>(DocCommandEffectRegistry.symbol),
    observations = container.resolve<ObservationRegistry>(ObservationRegistry.symbol),
    session = container.resolve<SessionStateRegistry>(SessionStateRegistry.symbol),
    extensions = container.resolve<DocRuntimeExtensionRegistry>(DocRuntimeExtensionRegistry.symbol),
    document = container.resolve<DocDocumentSessionCoordinator>(DocDocumentSessionCoordinator.symbol),
    config = container.resolve<ConfigEngine>(ConfigEngine.symbol);
  kernel.registerPlugin(input);
  const plugins = implementations.map((implementation) => container.resolve<DocPlugin<unknown>>(implementation.symbol));
  for (const plugin of plugins) kernel.registerPlugin(plugin);
  const runtime: DocPluginRuntime = {
    platform,
    commands,
    queries,
    observations,
    session,
    extensions,
    plugins: manager,
    document: {
      input,
      nodes: container.resolve(DocNodeRegistry.symbol),
      layout: container.resolve(DocLayoutEngine.symbol),
      inlineStyles: container.resolve(RichTextInlineStyleRegistry.symbol),
      lineBoxes: container.resolve(RichTextLineBoxRegistry.symbol),
      blockFlows: container.resolve(RichTextBlockFlowRegistry.symbol),
    },
  };
  const context: DocPluginSetupContext = { container, runtime };
  lifecycle.add(registerDocPluginInlineStyles(plugins, runtime.document.inlineStyles));
  lifecycle.add(registerDocPluginLineBoxes(plugins, runtime.document.lineBoxes));
  lifecycle.add(registerDocPluginBlockFlows(plugins, runtime.document.blockFlows));
  for (const plugin of plugins) plugin.configure?.(context);
  lifecycle.add(registerDocPluginCommands(manager.getAllPlugins(), commands));
  for (const plugin of plugins) plugin.registerQueries?.(queries);
  registerDocPluginObservations(manager.getAllPlugins(), observations);
  registerDocPluginSessionStates(manager.getAllPlugins(), session);
  registerDocPluginCapabilities(manager.getAllPlugins(), extensions);
  registerDocDocumentObservation(observations, document);
  registerDocInlineStyleObservation(observations, input, runtime.document.inlineStyles);
  registerDocStateSnapshotCommands(commands, document);
  registerDocSessionStateCommands(commands, session);
  registerDocConfigCommands(commands, config);
  observations.register(DocCommitObservation, {
    getSnapshot: () => kernel.getCommitSnapshot(),
    subscribe: (listener) => kernel.subscribeCommits(listener),
  });
  queries.register(ReadDocDocumentQuery, () => ({ document: document.getDocument() }));
  queries.register(ReadDocTextQuery, () => document.getText());
  queries.register(ReadDocSelectionQuery, () => input.session.docSelection);
  extensions.register(DocRuntimeCapability.Platform, platform);
  extensions.register(DocRuntimeCapability.Commands, commands);
  extensions.register(DocRuntimeCapability.Queries, queries);
  extensions.register(DocRuntimeCapability.Observations, observations);
  extensions.register(DocRuntimeCapability.Session, session);
  extensions.register(DocRuntimeCapability.Plugins, manager);
  extensions.register(DocRuntimeCapability.Document, runtime.document);
  extensions.register(DocRuntimeCapability.InlineStyles, runtime.document.inlineStyles);
  extensions.register(DocRuntimeCapability.LineBoxes, runtime.document.lineBoxes);
  extensions.register(DocRuntimeCapability.BlockFlows, runtime.document.blockFlows);
  commands.bind({
    executePipeline: (pipeline) => kernel.executePipeline(pipeline),
    applyEffect: (effect) => effects.dispatch(effect),
  });
  kernel.enforceCommandBoundary(
    commands.isExecuting.bind(commands),
    commands.runWithoutMutationAuthority.bind(commands),
  );
  const ownerToken = {},
    sessionToken = {};
  let tearingDown = false,
    initialized = false,
    started = false,
    sealed = false,
    destroyed = false;
  lifecycle.add(() => extensions.destroy());
  lifecycle.add(() => kernel.destroy(ownerToken));
  lifecycle.add(() => commands.destroy());
  lifecycle.add(() => queries.destroy());
  lifecycle.add(() => effects.destroy());
  lifecycle.add(() => observations.destroy());
  lifecycle.add(() => session.clear(sessionToken));
  lifecycle.add(() => {
    for (const plugin of [...plugins].reverse()) plugin.onEditorDestroy?.(context);
  });
  lifecycle.add(() => {
    tearingDown = true;
  });
  const assertWrite = (): void => {
    if (!tearingDown && !commands.isExecuting())
      throw new SearError('Doc business services must change through editor.commands.run(...).');
  };
  const editor: DocKernelEditor = {
    commands,
    queries,
    observations,
    services: createRuntimeCapabilityReader(extensions, [
      DocRuntimeCapability.Plugins,
      DocRuntimeCapability.Document,
      DocRuntimeCapability.Session,
    ]),
    getDocument: () => queries.run(ReadDocDocumentQuery, void 0).document,
    getText: () => queries.run(ReadDocTextQuery, void 0),
    loadDocument: (content) => {
      commands.run(LoadDocumentCommand, { document: content });
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      tearingDown = true;
      lifecycle.dispose();
    },
  };
  return {
    kernel,
    runtime,
    editor,
    beginTeardown(): void {
      tearingDown = true;
    },
    sealCommands(): void {
      DocCommandBus.prototype.enforceRegistrationBoundary.call(commands, assertWrite);
    },
    initialize(): void {
      if (initialized) return;
      initialized = true;
      document.loadDocument(options.documentState.document);
      session.loadSnapshot(options.sessionState ?? {});
      session.restorePhase(SessionStateRestorePhase.BeforeInitialize);
      kernel.initialize();
      session.restorePhase(SessionStateRestorePhase.AfterInitialize);
      session.sealRestoration(sessionToken);
      input.sealSessionRestoration();
      for (const plugin of plugins) plugin.initialize?.(context);
    },
    start(): void {
      if (started) return;
      started = true;
      for (const plugin of plugins) plugin.start?.(context);
    },
    seal(): void {
      if (sealed) return;
      sealed = true;
      kernel.enforceTeardownBoundary(ownerToken);
      sealDocPluginTeardownWrites(plugins, assertWrite);
      DocNodeRegistry.prototype.enforceWriteBoundary.call(runtime.document.nodes, assertWrite);
      runtime.document.inlineStyles.enforceWriteBoundary(assertWrite);
      runtime.document.lineBoxes.enforceWriteBoundary(assertWrite);
      runtime.document.blockFlows.enforceWriteBoundary(assertWrite);
      queries.enforceWriteBoundary(assertWrite);
      observations.enforceWriteBoundary(
        assertWrite,
        commands.runWithoutMutationAuthority.bind(commands),
        cloneSessionStateValue,
      );
      extensions.enforceWriteBoundary(assertWrite);
      sealSheetContributionWrites(effects, assertWrite);
      config.enforceCommandBoundary(commands.isExecuting.bind(commands));
    },
  };
}
