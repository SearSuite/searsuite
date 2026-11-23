import { SheetRangeMoveRegistry, SheetStructureMoveRegistry } from '@searsuite/sear-assembly-plugin';
import { ConfigEngine } from '@searsuite/sear-assembly-config';
import { SheetCommandBus, SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { IFunctionRegistry } from '@searsuite/sear-domain-formula-engine';
import { IFormulaTextServiceProvider } from '@searsuite/sear-domain-formula-engine';
import { IFormulaExternalServiceProvider } from '@searsuite/sear-domain-formula-engine';
import {
  PipelineStepExecutorRegistry,
  SearCoreSheet,
  SheetInteractionReducerRegistry,
  SheetInteractionStore,
  SheetLifecycleCoordinator,
} from '@searsuite/sear-assembly-core';
import {
  hasPluginCommandRegistrar,
  hasPluginQueryRegistrar,
  hasPluginObservationRegistrar,
  hasPluginRuntimeCapabilityRegistrar,
  hasPluginSessionStateRegistrar,
  Plugin,
  SessionStateRegistry,
  type PluginExtension,
  type PluginManager,
} from '@searsuite/sear-assembly-plugin';
import { CellTypeCatalog } from '@searsuite/sear-domain-cell';
import { type Container } from '@searsuite/sear-foundation-di';
import { Platform, WebServiceClient, XmlXPathEvaluator } from '@searsuite/sear-foundation-platform';
import { type SheetEmbeddedEditor } from '@searsuite/sear-sheet-editor-contract';
import { PositionRect } from '@searsuite/sear-foundation-rect';
import { ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { type HexColor } from '@searsuite/sear-foundation-utils';
import {
  Container as RenderContainer,
  DirtyTree,
  GenerationalDirtyTracker,
  SceneGraph,
  Tree,
} from '@searsuite/sear-render-node';
import { CoordinateTransformer, RenderContext } from '@searsuite/sear-render-context';
import { ScrollManager, Scroller } from '@searsuite/sear-render-scroll';
import { SheetDataEngine, SheetRenderEngine } from '@searsuite/sear-render-engine';
import { TextShaper } from '@searsuite/sear-render-metrics';
import {
  type CellProperties,
  type SheetCellVisualReaderRegistrationContext,
  SheetCellVisualReaderRegistry,
  SheetRenderCoordinatorManager,
  SheetRendererRegistry,
} from '@searsuite/sear-render-registry';
import { RenderStrategyManager, type RenderStrategy } from '@searsuite/sear-render-strategy';
import { EventEngine, EventRegistrar } from '@searsuite/sear-render-event-engine';
import { KeyboardRouter, PointerCapture, TextInput } from '@searsuite/sear-render-input';
import { CursorEngine, CursorRegistry } from '@searsuite/sear-render-cursor';
import { CoordinateEngine } from '@searsuite/sear-render-coord';
import { type CollaborationSession, SheetCollaborationPlugin } from '@searsuite/sear-plugin-collab';
import { SearFormulaBar, SearToolbar } from '@searsuite/sear-assembly-plugin';
import {
  FormulaResultProviderRegistry,
  FormulaRichResultProviderRegistry,
  FormulaSourceProviderRegistry,
} from '@searsuite/sear-plugin-formula';
import { defineSheetRuntimeCapability, SheetRuntimeExtensionRegistry } from './SheetRuntimeExtensionRegistry';

/**
 * Stable host capabilities available before the command bus and Core are
 * ready. Services are grouped by responsibility so plugins need not rely on
 * untyped container lookups for normal extension work.
 */
export interface SheetPluginSetupRuntime {
  readonly extensions: SheetRuntimeExtensionRegistry;
  readonly platform: Platform;
  readonly config: ConfigEngine;
  readonly observations: ObservationRegistry;
  readonly queries: SheetQueryRegistry;
  /** Editor-local capture and restore registry shared by every session-state owner. */
  readonly session: SessionStateRegistry;
  readonly plugins: PluginManager<SearCoreSheet, CellProperties>;
  readonly data: SheetDataEngine;
  readonly textShaper: TextShaper;
  readonly render: {
    readonly engine: SheetRenderEngine;
    readonly stage: SceneGraph<CellProperties>;
    readonly tree: Tree<RenderContainer>;
    readonly dirtyTree: Tree<PositionRect<HexColor>>;
    readonly dirtyTracker: GenerationalDirtyTracker;
    readonly contexts: {
      readonly main: RenderContext;
      readonly offScreen: RenderContext;
      readonly hit: RenderContext;
    };
    readonly strategies: RenderStrategyManager<CellProperties>;
    readonly rendererRegistry: SheetRendererRegistry<CellProperties>;
    readonly cellVisualReaders: SheetCellVisualReaderRegistry;
    readonly coordinator: SheetRenderCoordinatorManager;
  };
  readonly events: {
    readonly engine: EventEngine<CellProperties>;
    readonly registrar: EventRegistrar;
  };
  readonly input: {
    readonly text: TextInput;
    readonly keyboard: KeyboardRouter;
    readonly pointer: PointerCapture;
    readonly cursor: CursorEngine;
    readonly cursorRules: CursorRegistry;
  };
  readonly scroll: {
    readonly manager: ScrollManager;
    readonly scroller: Scroller;
    readonly coordinates: CoordinateEngine;
    readonly transformer: CoordinateTransformer;
  };
  readonly cells: {
    readonly catalog: CellTypeCatalog;
  };
  readonly formula: {
    /** Editor-local formula function registry. Registrations return an explicit disposer. */
    readonly functions: IFunctionRegistry;
    /** Editor-local registry for metadata and cached external formula services. */
    readonly textServices: IFormulaTextServiceProvider;
    readonly externalServices: IFormulaExternalServiceProvider;
    /** Editor-local formula result provider registry. Registrations return an explicit disposer. */
    readonly results: FormulaResultProviderRegistry;
    readonly richResults: FormulaRichResultProviderRegistry;
    /** Editor-local formula source provider registry. Registrations return an explicit disposer. */
    readonly sources: FormulaSourceProviderRegistry;
    /** Editor-local XML/XPath execution capability. */
    readonly xmlXPath: XmlXPathEvaluator;
    /** Editor-local asynchronous web-service transport capability. */
    readonly webService: WebServiceClient;
  };
  readonly interaction: {
    readonly store: SheetInteractionStore;
    readonly reducers: SheetInteractionReducerRegistry;
    readonly pipelineSteps: PipelineStepExecutorRegistry;
  };
  readonly lifecycle: SheetLifecycleCoordinator;
  /** Optional Sheet-facing rich-text editor supplied by the host. */
  readonly embeddedEditor?:
    | {
        readonly editor: SheetEmbeddedEditor;
      }
    | undefined;
  readonly collaboration: {
    /** Editor-local collaboration status; lifecycle changes use typed commands. */
    readonly session: Pick<CollaborationSession, 'getStatus'>;
  };
}

/** Runtime capabilities available after the command bus is bound and Core exists. */
export interface SheetPluginRuntime extends SheetPluginSetupRuntime {
  readonly commands: SheetCommandBus;
  readonly toolbar: SearToolbar;
}

export const SheetRuntimeCapability = {
  Platform: defineSheetRuntimeCapability<Platform>('sheet.runtime.platform'),
  Config: defineSheetRuntimeCapability<ConfigEngine>('sheet.runtime.config'),
  Commands: defineSheetRuntimeCapability<SheetCommandBus>('sheet.runtime.commands'),
  Queries: defineSheetRuntimeCapability<SheetQueryRegistry>('sheet.runtime.queries'),
  Observations: defineSheetRuntimeCapability<ObservationRegistry>('sheet.runtime.observations'),
  Session: defineSheetRuntimeCapability<SessionStateRegistry>('sheet.runtime.session'),
  Plugins: defineSheetRuntimeCapability<PluginManager<SearCoreSheet, CellProperties>>('sheet.runtime.plugins'),
  Data: defineSheetRuntimeCapability<SheetDataEngine>('sheet.runtime.data'),
  TextShaper: defineSheetRuntimeCapability<TextShaper>('sheet.runtime.textShaper'),
  Render: defineSheetRuntimeCapability<SheetPluginSetupRuntime['render']>('sheet.runtime.render'),
  Events: defineSheetRuntimeCapability<SheetPluginSetupRuntime['events']>('sheet.runtime.events'),
  Input: defineSheetRuntimeCapability<SheetPluginSetupRuntime['input']>('sheet.runtime.input'),
  Scroll: defineSheetRuntimeCapability<SheetPluginSetupRuntime['scroll']>('sheet.runtime.scroll'),
  Cells: defineSheetRuntimeCapability<SheetPluginSetupRuntime['cells']>('sheet.runtime.cells'),
  Formula: defineSheetRuntimeCapability<SheetPluginSetupRuntime['formula']>('sheet.runtime.formula'),
  Interaction: defineSheetRuntimeCapability<SheetPluginSetupRuntime['interaction']>('sheet.runtime.interaction'),
  Lifecycle: defineSheetRuntimeCapability<SheetLifecycleCoordinator>('sheet.runtime.lifecycle'),
  EmbeddedEditor: defineSheetRuntimeCapability<{ readonly editor: SheetEmbeddedEditor }>(
    'sheet.runtime.embedded-editor',
  ),
  Collaboration: defineSheetRuntimeCapability<SheetPluginSetupRuntime['collaboration']>('sheet.runtime.collaboration'),
  Toolbar: defineSheetRuntimeCapability<SearToolbar>('sheet.runtime.toolbar'),
  FormulaBar: defineSheetRuntimeCapability<SearFormulaBar>('sheet.runtime.formula-bar'),
} as const;

/** Services available while createSheetEditor() registers Sheet plugins. */
export interface SheetPluginServiceContext {
  readonly container: Container;
}

/** Typed public services available before createSheetEditor() creates its Core. */
export interface SheetPluginSetupContext {
  readonly container: Container;
  readonly runtime: SheetPluginSetupRuntime;
  addStrategy(
    token: symbol,
    strategy: RenderStrategy<CellProperties>,
    position: { before: symbol } | { after: symbol },
  ): void;
}

/** Sheet setup capabilities plus the Core created by createSheetEditor(). */
export interface SheetPluginRuntimeContext extends SheetPluginSetupContext {
  readonly core: SearCoreSheet;
  readonly runtime: SheetPluginRuntime;
}

/** Convenience base class for a Plugin targeting createSheetEditor(). */
export abstract class SheetPlugin<StateType>
  extends Plugin<SearCoreSheet, CellProperties, StateType>
  implements
    PluginExtension<
      SheetCommandBus,
      ObservationRegistry,
      SessionStateRegistry,
      SheetRuntimeExtensionRegistry,
      SheetQueryRegistry
    >
{
  /** Registers bindings required before this Sheet plugin is instantiated. */
  public static registerServices?(context: SheetPluginServiceContext): void;

  /** Registers every stable command id owned by this plugin. */
  public registerCommands?(commands: SheetCommandBus): void;
  public registerQueries?(queries: SheetQueryRegistry): void;
  /** Contributes state-owner planning for same-sheet cell moves. */
  public registerRangeMoves?(registry: SheetRangeMoveRegistry): void;
  /** Contributes preflight and dependent operation planning for whole-axis reordering. */
  public registerStructureMoves?(registry: SheetStructureMoveRegistry): void;

  /** Registers typed state and event observations owned by this plugin. */
  public registerObservations?(observations: ObservationRegistry): void;

  /** Contributes owner-defined format capture and transfer plans. */
  public registerFormatTransfers?(
    registry: import('@searsuite/sear-assembly-plugin').SheetFormatTransferRegistry,
  ): void;

  /** Contributes state-owner data carried by ordinary clipboard copy and paste. */
  public registerClipboardTransfers?(
    registry: import('@searsuite/sear-assembly-plugin').SheetClipboardTransferRegistry,
  ): void;

  /** Registers local state that must survive an in-memory editor remount. */
  public registerSessionState?(registry: SessionStateRegistry): void;

  /** Registers plugin-owned properties used to compose rendered Sheet cells. */
  public registerCellVisualReaders?(
    registry: SheetCellVisualReaderRegistry,
    context: SheetCellVisualReaderRegistrationContext,
  ): void;

  /** Publishes typed runtime services owned by this plugin. */
  public registerCapabilities?(registry: SheetRuntimeExtensionRegistry): void;

  /** Configures the Sheet editor before its Core is created. */
  public configure?(context: SheetPluginSetupContext): void;

  /**
   * Prepares behavior that requires initialized Core state but must run before
   * the first frame and other runtime effects.
   */
  public initialize?(context: SheetPluginRuntimeContext): void;

  /** Starts runtime behavior after the Core has rendered its first frame. */
  public start?(context: SheetPluginRuntimeContext): void;

  /**
   * Releases resources owned by this plugin before the Core is destroyed.
   *
   * This deliberately does not use the name `destroy`: DI containers may
   * treat a no-argument destroy() method as an owned-instance disposer.
   */
  public onEditorDestroy?(context: SheetPluginRuntimeContext): void;
}

/** Injectable SheetPlugin class accepted by createSheetEditor(). */
export interface SheetPluginImplementation<TPlugin extends SheetPlugin<unknown>> {
  new (...args: never[]): TPlugin;
  readonly symbol: symbol;
  registerServices?(context: SheetPluginServiceContext): void;
}

interface SheetPluginRuntimeOptions {
  readonly container: Container;
  readonly configEngine: ConfigEngine;
  readonly dataEngine: SheetDataEngine;
  readonly stage: SceneGraph<CellProperties>;
  readonly renderContexts: SheetPluginSetupRuntime['render']['contexts'];
  readonly rendererRegistry: SheetRendererRegistry<CellProperties>;
  readonly scroller: Scroller;
  readonly scrollManager: ScrollManager;
  readonly embeddedEditor?: SheetEmbeddedEditor | undefined;
  readonly pluginManager: PluginManager<SearCoreSheet, CellProperties>;
}

/** Creates the typed setup facade available before the command bus and Core are ready. */
export function createSheetPluginSetupRuntime(options: SheetPluginRuntimeOptions): SheetPluginSetupRuntime {
  const { container } = options;
  const extensions = new SheetRuntimeExtensionRegistry();
  const render = {
    engine: container.resolve<SheetRenderEngine>(SheetRenderEngine.symbol),
    stage: options.stage,
    tree: container.resolve<Tree<RenderContainer>>(Tree.symbol),
    dirtyTree: container.resolve<Tree<PositionRect<HexColor>>>(DirtyTree.symbol),
    dirtyTracker: container.resolve<GenerationalDirtyTracker>(GenerationalDirtyTracker.symbol),
    contexts: options.renderContexts,
    strategies: container.resolve<RenderStrategyManager<CellProperties>>(RenderStrategyManager.symbol),
    rendererRegistry: options.rendererRegistry,
    cellVisualReaders: container.resolve<SheetCellVisualReaderRegistry>(SheetCellVisualReaderRegistry.symbol),
    coordinator: container.resolve<SheetRenderCoordinatorManager>(SheetRenderCoordinatorManager.symbol),
  };
  const events = {
    engine: container.resolve<EventEngine<CellProperties>>(EventEngine.symbol),
    registrar: container.resolve<EventRegistrar>(EventRegistrar.symbol),
  };
  const input = {
    text: container.resolve<TextInput>(TextInput.symbol),
    keyboard: container.resolve<KeyboardRouter>(KeyboardRouter.symbol),
    pointer: container.resolve<PointerCapture>(PointerCapture.symbol),
    cursor: container.resolve<CursorEngine>(CursorEngine.symbol),
    cursorRules: container.resolve<CursorRegistry>(CursorRegistry.symbol),
  };
  const scroll = {
    manager: options.scrollManager,
    scroller: options.scroller,
    coordinates: container.resolve<CoordinateEngine>(CoordinateEngine.symbol),
    transformer: container.resolve<CoordinateTransformer>(CoordinateTransformer.symbol),
  };
  const cells = {
    catalog: container.resolve<CellTypeCatalog>(CellTypeCatalog.symbol),
  };
  const formula = {
    functions: container.resolve<IFunctionRegistry>(IFunctionRegistry.symbol),
    textServices: container.resolve<IFormulaTextServiceProvider>(IFormulaTextServiceProvider.symbol),
    externalServices: container.resolve<IFormulaExternalServiceProvider>(IFormulaExternalServiceProvider.symbol),
    results: container.resolve<FormulaResultProviderRegistry>(FormulaResultProviderRegistry.symbol),
    richResults: container.resolve<FormulaRichResultProviderRegistry>(FormulaRichResultProviderRegistry.symbol),
    sources: container.resolve<FormulaSourceProviderRegistry>(FormulaSourceProviderRegistry.symbol),
    xmlXPath: container.resolve<XmlXPathEvaluator>(XmlXPathEvaluator.symbol),
    webService: container.resolve<WebServiceClient>(WebServiceClient.symbol),
  };
  const interaction = {
    store: container.resolve<SheetInteractionStore>(SheetInteractionStore.symbol),
    reducers: container.resolve<SheetInteractionReducerRegistry>(SheetInteractionReducerRegistry.symbol),
    pipelineSteps: container.resolve<PipelineStepExecutorRegistry>(PipelineStepExecutorRegistry.symbol),
  };
  const collaborationPlugin = container.resolve<SheetCollaborationPlugin>(SheetCollaborationPlugin.symbol);
  const collaboration = Object.freeze({
    session: Object.freeze({
      getStatus: () => collaborationPlugin.getStatus(),
    }),
  });

  extensions.register(SheetRuntimeCapability.Platform, container.resolve<Platform>(Platform.symbol));
  extensions.register(SheetRuntimeCapability.Config, options.configEngine);
  extensions.register(
    SheetRuntimeCapability.Observations,
    container.resolve<ObservationRegistry>(ObservationRegistry.symbol),
  );
  extensions.register(SheetRuntimeCapability.Queries, container.resolve<SheetQueryRegistry>(SheetQueryRegistry.symbol));
  extensions.register(
    SheetRuntimeCapability.Session,
    container.resolve<SessionStateRegistry>(SessionStateRegistry.symbol),
  );
  extensions.register(SheetRuntimeCapability.Plugins, options.pluginManager);
  extensions.register(SheetRuntimeCapability.Data, options.dataEngine);
  extensions.register(SheetRuntimeCapability.TextShaper, container.resolve<TextShaper>(TextShaper.symbol));
  extensions.register(SheetRuntimeCapability.Render, render);
  extensions.register(SheetRuntimeCapability.Events, events);
  extensions.register(SheetRuntimeCapability.Input, input);
  extensions.register(SheetRuntimeCapability.Scroll, scroll);
  extensions.register(SheetRuntimeCapability.Cells, cells);
  extensions.register(SheetRuntimeCapability.Formula, formula);
  extensions.register(SheetRuntimeCapability.Interaction, interaction);
  extensions.register(
    SheetRuntimeCapability.Lifecycle,
    container.resolve<SheetLifecycleCoordinator>(SheetLifecycleCoordinator.symbol),
  );
  if (options.embeddedEditor) {
    extensions.register(SheetRuntimeCapability.EmbeddedEditor, { editor: options.embeddedEditor });
  }
  extensions.register(SheetRuntimeCapability.Collaboration, collaboration);

  return {
    extensions,
    platform: extensions.require(SheetRuntimeCapability.Platform),
    config: extensions.require(SheetRuntimeCapability.Config),
    observations: extensions.require(SheetRuntimeCapability.Observations),
    queries: extensions.require(SheetRuntimeCapability.Queries),
    session: extensions.require(SheetRuntimeCapability.Session),
    plugins: extensions.require(SheetRuntimeCapability.Plugins),
    data: extensions.require(SheetRuntimeCapability.Data),
    textShaper: extensions.require(SheetRuntimeCapability.TextShaper),
    render: extensions.require(SheetRuntimeCapability.Render),
    events: extensions.require(SheetRuntimeCapability.Events),
    input: extensions.require(SheetRuntimeCapability.Input),
    scroll: extensions.require(SheetRuntimeCapability.Scroll),
    cells: extensions.require(SheetRuntimeCapability.Cells),
    formula: extensions.require(SheetRuntimeCapability.Formula),
    interaction: extensions.require(SheetRuntimeCapability.Interaction),
    lifecycle: extensions.require(SheetRuntimeCapability.Lifecycle),
    embeddedEditor: options.embeddedEditor ? extensions.require(SheetRuntimeCapability.EmbeddedEditor) : undefined,
    collaboration: extensions.require(SheetRuntimeCapability.Collaboration),
  };
}

/** Runs the register sheet plugin commands helper. */
export function registerSheetPluginCommands(plugins: readonly unknown[], commands: SheetCommandBus): void {
  plugins.forEach(function registerSheetPluginCommand(plugin) {
    if (hasPluginCommandRegistrar<SheetCommandBus>(plugin)) plugin.registerCommands(commands);
  });
}

interface SheetCellVisualReaderRegistrar {
  registerCellVisualReaders(
    registry: SheetCellVisualReaderRegistry,
    context: SheetCellVisualReaderRegistrationContext,
  ): void;
}

/** Registers every plugin-owned Sheet cell visual reader. */
export function registerSheetPluginCellVisualReaders(
  plugins: readonly unknown[],
  registry: SheetCellVisualReaderRegistry,
  context: SheetCellVisualReaderRegistrationContext,
): void {
  plugins.forEach((plugin) => {
    if (hasSheetCellVisualReaderRegistrar(plugin)) plugin.registerCellVisualReaders(registry, context);
  });
}

function hasSheetCellVisualReaderRegistrar(plugin: unknown): plugin is SheetCellVisualReaderRegistrar {
  return typeof (plugin as { registerCellVisualReaders?: unknown }).registerCellVisualReaders === 'function';
}

export function registerSheetPluginQueries(plugins: readonly unknown[], queries: SheetQueryRegistry): void {
  plugins.forEach(function registerSheetPluginQuery(plugin) {
    if (hasPluginQueryRegistrar<SheetQueryRegistry>(plugin)) plugin.registerQueries(queries);
  });
}

/** Registers every typed observation source contributed by Sheet plugins. */
export function registerSheetPluginObservations(plugins: readonly unknown[], observations: ObservationRegistry): void {
  plugins.forEach(function registerSheetPluginObservation(plugin) {
    if (hasPluginObservationRegistrar<ObservationRegistry>(plugin)) plugin.registerObservations(observations);
  });
}

/** Registers every local session-state adapter contributed by Sheet plugins. */
export function registerSheetPluginSessionStates(plugins: readonly unknown[], registry: SessionStateRegistry): void {
  plugins.forEach(function registerSheetPluginSessionState(plugin) {
    if (hasPluginSessionStateRegistrar<SessionStateRegistry>(plugin)) plugin.registerSessionState(registry);
  });
}

/** Publishes every typed runtime capability contributed by Sheet plugins. */
export function registerSheetPluginCapabilities(
  plugins: readonly unknown[],
  registry: SheetRuntimeExtensionRegistry,
): void {
  plugins.forEach(function registerSheetPluginCapability(plugin) {
    if (hasPluginRuntimeCapabilityRegistrar<SheetRuntimeExtensionRegistry>(plugin)) {
      plugin.registerCapabilities(registry);
    }
  });
}
