import { createSheetPluginSetupRuntime } from '@searsuite/sear-assembly-sheet-kernel';
import { ViewExtensionBase } from '@searsuite/sear-render-event-engine';
import { type SheetCellStyleReader } from '@searsuite/sear-domain-cell-types';
import { SheetRuntimeCapability } from '@searsuite/sear-assembly-commands';

import { ConfigEngine } from '@searsuite/sear-assembly-config';
import { SheetCommandBus, SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { IFunctionRegistry } from '@searsuite/sear-domain-formula-engine';
import { IFormulaTextServiceProvider } from '@searsuite/sear-domain-formula-engine';
import { IFormulaExternalServiceProvider } from '@searsuite/sear-domain-formula-engine';
import { SearCoreSheet, SheetLifecycleCoordinator } from '@searsuite/sear-assembly-core';
import { PipelineStepExecutorRegistry, SheetInteractionReducerRegistry, SheetInteractionStore } from '@searsuite/sear-assembly-plugin';
import { SessionStateRegistry, type PluginManager } from '@searsuite/sear-assembly-plugin';
import { CellTypeCatalog } from '@searsuite/sear-domain-cell';
import { type Container } from '@searsuite/sear-foundation-di';
import { Platform, WebServiceClient, XmlXPathEvaluator } from '@searsuite/sear-foundation-platform';
import { type SheetEmbeddedEditor } from '@searsuite/sear-sheet-editor-contract';
import { PositionRect } from '@searsuite/sear-foundation-rect';
import { ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { type HexColor } from '@searsuite/sear-foundation-utils';
import { Container as RenderContainer, DirtyTree, FrameDirtyTracker, SceneGraph, Tree } from '@searsuite/sear-render-node';
import { CoordinateTransformer, RenderContext } from '@searsuite/sear-render-context';
import { ScrollManager, Scroller } from '@searsuite/sear-render-scroll';
import { SheetRenderEngine } from '@searsuite/sear-render-engine';
import { SheetDataEngine } from '@searsuite/sear-domain-sheet';
import { TextShaper } from '@searsuite/sear-render-metrics';
import { type CellProperties, SheetCellVisualReaderRegistry, SheetRenderCoordinatorManager, SheetRendererRegistry } from '@searsuite/sear-render-registry';
import { RenderStrategyManager, type RenderStrategy } from '@searsuite/sear-render-strategy';
import { EventEngine, EventRegistrar } from '@searsuite/sear-render-event-engine';
import { KeyboardRouter, PointerCapture, TextInput } from '@searsuite/sear-render-input';
import { CursorEngine, CursorRegistry } from '@searsuite/sear-render-cursor';
import { CoordinateEngine } from '@searsuite/sear-render-coord';
import { type CollaborationSession, SheetCollaborationPlugin } from '@searsuite/sear-plugin-collab';
import { SearFormulaBar, SearToolbar } from '@searsuite/sear-assembly-plugin';
import { FormulaResultProviderRegistry, FormulaRichResultProviderRegistry, FormulaSourceProviderRegistry } from '@searsuite/sear-plugin-formula';
import { defineSheetRuntimeCapability, SheetRuntimeExtensionRegistry } from '@searsuite/sear-assembly-commands';

/**
 * Stable host capabilities available before the command bus and Core are
 * ready. Services are grouped by responsibility so plugins need not rely on
 * untyped container lookups for normal extension work.
 */
export interface SheetViewSetupRuntime {
  /** Editor-local registry of typed capabilities, without global mutable registrations. */
  readonly extensions: SheetRuntimeExtensionRegistry;
  /** Host-provided timing, scheduling and diagnostic operations. */
  readonly platform: Platform;
  /** Editor-local defaults and configuration contributions. */
  readonly config: ConfigEngine;
  /** Typed state and event subscriptions; listeners receive no mutation authority. */
  readonly observations: ObservationRegistry;
  /** Read-only typed queries over the latest committed state. */
  readonly queries: SheetQueryRegistry;
  /** Editor-local capture and restore registry shared by every session-state owner. */
  readonly session: SessionStateRegistry;
  /** Business state owners registered in this editor instance. */
  readonly plugins: PluginManager;
  /** Sparse Sheet state and neutral data-field projections. */
  readonly data: SheetDataEngine;
  /** Semantic cell appearance shared by automation, filtering and views. */
  readonly styles: SheetCellStyleReader;
  readonly textShaper: TextShaper;
  /** Reads committed state and returns retained nodes for the current viewport. */
  readonly render: {
    readonly engine: SheetRenderEngine;
    readonly stage: SceneGraph<CellProperties>;
    readonly tree: Tree<RenderContainer>;
    readonly dirtyTree: Tree<PositionRect<HexColor>>;
    readonly dirtyTracker: FrameDirtyTracker;
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
  /** Semantic cell types, validation, display text and clipboard behavior. */
  readonly cells: {
    readonly catalog: CellTypeCatalog;
  };
  /** Formula functions, sources, results and external data capabilities. */
  readonly formula: {
    /** Editor-local formula function registry. Registrations return an explicit disposer. */
    readonly functions: IFunctionRegistry;
    /** Editor-local registry for metadata and cached external formula services. */
    readonly textServices: IFormulaTextServiceProvider;
    /** Asynchronous external data services used by formula evaluation. */
    readonly externalServices: IFormulaExternalServiceProvider;
    /** Editor-local formula result provider registry. Registrations return an explicit disposer. */
    readonly results: FormulaResultProviderRegistry;
    /** Read-only rich or structured formula results. */
    readonly richResults: FormulaRichResultProviderRegistry;
    /** Editor-local formula source provider registry. Registrations return an explicit disposer. */
    readonly sources: FormulaSourceProviderRegistry;
    /** Editor-local XML/XPath execution capability. */
    readonly xmlXPath: XmlXPathEvaluator;
    /** Editor-local asynchronous web-service transport capability. */
    readonly webService: WebServiceClient;
  };
  /** Local interaction state and its command-owned reducers. */
  readonly interaction: {
    /** The committed local interaction state store. */
    readonly store: SheetInteractionStore;
    /** Editor-local reducers for typed interaction actions. */
    readonly reducers: SheetInteractionReducerRegistry;
    /** Registered executors for staged command pipeline steps. */
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
export interface SheetViewRuntime extends SheetViewSetupRuntime {
  /** The owning typed dispatcher through which state mutations are executed. */
  readonly commands: SheetCommandBus;
  readonly toolbar: SearToolbar;
}

export const SheetViewCapability = {
  TextShaper: defineSheetRuntimeCapability<TextShaper>('sheet.runtime.textShaper'),
  Render: defineSheetRuntimeCapability<SheetViewSetupRuntime['render']>('sheet.runtime.render'),
  Events: defineSheetRuntimeCapability<SheetViewSetupRuntime['events']>('sheet.runtime.events'),
  Input: defineSheetRuntimeCapability<SheetViewSetupRuntime['input']>('sheet.runtime.input'),
  Scroll: defineSheetRuntimeCapability<SheetViewSetupRuntime['scroll']>('sheet.runtime.scroll'),
  Lifecycle: defineSheetRuntimeCapability<SheetLifecycleCoordinator>('sheet.runtime.lifecycle'),
  EmbeddedEditor: defineSheetRuntimeCapability<{ readonly editor: SheetEmbeddedEditor }>(
    'sheet.runtime.embedded-editor',
  ),
  Collaboration: defineSheetRuntimeCapability<SheetViewSetupRuntime['collaboration']>('sheet.runtime.collaboration'),
  Toolbar: defineSheetRuntimeCapability<SearToolbar>('sheet.runtime.toolbar'),
  FormulaBar: defineSheetRuntimeCapability<SearFormulaBar>('sheet.runtime.formula-bar'),
} as const;

/** Services available while createSheetEditor() registers Sheet plugins. */
export interface SheetViewServiceContext {
  /** Editor-local dependency container available only during composition. */
  readonly container: Container;
}

/** Typed public services available before createSheetEditor() creates its Core. */
export interface SheetViewSetupContext {
  /** Editor-local dependency container available only during composition. */
  readonly container: Container;
  /** Capabilities owned by the currently assembled editor instance. */
  readonly runtime: SheetViewSetupRuntime;
  addStrategy(
    token: symbol,
    strategy: RenderStrategy<CellProperties>,
    position: { before: symbol } | { after: symbol },
  ): void;
}

/** Sheet setup capabilities plus the Core created by createSheetEditor(). */
export interface SheetViewRuntimeContext extends SheetViewSetupContext {
  readonly core: SearCoreSheet;
  /** Capabilities owned by the currently assembled editor instance. */
  readonly runtime: SheetViewRuntime;
}

interface SheetViewRuntimeOptions {
  /** Editor-local dependency container available only during composition. */
  readonly container: Container;
  readonly configEngine: ConfigEngine;
  readonly dataEngine: SheetDataEngine;
  readonly stage: SceneGraph<CellProperties>;
  readonly renderContexts: SheetViewSetupRuntime['render']['contexts'];
  readonly rendererRegistry: SheetRendererRegistry<CellProperties>;
  readonly scroller: Scroller;
  readonly scrollManager: ScrollManager;
  readonly embeddedEditor?: SheetEmbeddedEditor | undefined;
  readonly pluginManager: PluginManager;
}

/** Creates the typed setup facade available before the command bus and Core are ready. */
export function createSheetViewSetupRuntime(options: SheetViewRuntimeOptions): SheetViewSetupRuntime {
  const { container } = options;
  const stateRuntime = createSheetPluginSetupRuntime(options);
  const { styles, extensions, cells, formula, interaction } = stateRuntime;
  const render = {
    engine: container.resolve<SheetRenderEngine>(SheetRenderEngine.symbol),
    stage: options.stage,
    tree: container.resolve<Tree<RenderContainer>>(Tree.symbol),
    dirtyTree: container.resolve<Tree<PositionRect<HexColor>>>(DirtyTree.symbol),
    dirtyTracker: container.resolve<FrameDirtyTracker>(FrameDirtyTracker.symbol),
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
  const collaborationPlugin = container.resolve<SheetCollaborationPlugin>(SheetCollaborationPlugin.symbol);
  const collaboration = Object.freeze({
    session: Object.freeze({
      getStatus: () => collaborationPlugin.getStatus(),
    }),
  });
  extensions.register(SheetViewCapability.TextShaper, container.resolve<TextShaper>(TextShaper.symbol));
  extensions.register(SheetViewCapability.Render, render);
  extensions.register(SheetViewCapability.Events, events);
  extensions.register(SheetViewCapability.Input, input);
  extensions.register(SheetViewCapability.Scroll, scroll);
  extensions.register(
    SheetViewCapability.Lifecycle,
    container.resolve<SheetLifecycleCoordinator>(SheetLifecycleCoordinator.symbol),
  );
  if (options.embeddedEditor) {
    extensions.register(SheetViewCapability.EmbeddedEditor, { editor: options.embeddedEditor });
  }
  extensions.register(SheetViewCapability.Collaboration, collaboration);
  return {
    extensions,
    platform: extensions.require(SheetRuntimeCapability.Platform),
    config: extensions.require(SheetRuntimeCapability.Config),
    observations: extensions.require(SheetRuntimeCapability.Observations),
    queries: extensions.require(SheetRuntimeCapability.Queries),
    session: extensions.require(SheetRuntimeCapability.Session),
    plugins: extensions.require(SheetRuntimeCapability.Plugins),
    data: extensions.require(SheetRuntimeCapability.Data),
    styles: extensions.require(SheetRuntimeCapability.Styles),
    textShaper: extensions.require(SheetViewCapability.TextShaper),
    render: extensions.require(SheetViewCapability.Render),
    events: extensions.require(SheetViewCapability.Events),
    input: extensions.require(SheetViewCapability.Input),
    scroll: extensions.require(SheetViewCapability.Scroll),
    cells: extensions.require(SheetRuntimeCapability.Cells),
    formula,
    interaction: extensions.require(SheetRuntimeCapability.Interaction),
    lifecycle: extensions.require(SheetViewCapability.Lifecycle),
    embeddedEditor: options.embeddedEditor ? extensions.require(SheetViewCapability.EmbeddedEditor) : undefined,
    collaboration: extensions.require(SheetViewCapability.Collaboration),
  };
}

/** Presentation lifecycle and contributions selected separately from business plugins. */
export abstract class SheetView extends ViewExtensionBase<SearCoreSheet, CellProperties> {
  /** Registers editor-local dependencies before this contribution is constructed. */
  public static registerServices?(context: SheetViewServiceContext): void;
  /** Registers typed commands; subsequent mutations run through the owning command bus. */
  public registerCommands?(commands: SheetCommandBus): void;
  /** Registers read-only projections without granting mutation authority to callers. */
  public registerQueries?(queries: SheetQueryRegistry): void;
  /** Registers state or event sources whose subscriptions are owned by this editor. */
  public registerObservations?(observations: ObservationRegistry): void;
  /** Registers detachable local session state separately from durable document content. */
  public registerSessionState?(session: SessionStateRegistry): void;
  /** Connects editor-local capabilities during assembly before startup. */
  public configure?(context: SheetViewSetupContext): void;
  /** Completes setup after command, query and observation registrations are available. */
  public initialize?(context: SheetViewRuntimeContext): void;
  /** Starts lifecycle-owned subscriptions after initialization succeeds. */
  public start?(context: SheetViewRuntimeContext): void;
}
export interface SheetViewImplementation<View extends SheetView = SheetView> {
  new (...args: never[]): View;
  /** Dependency injection token for this editor-local implementation. */
  readonly symbol: symbol;
  /** Registers editor-local dependencies before this contribution is constructed. */
  registerServices?(context: SheetViewServiceContext): void;
}
