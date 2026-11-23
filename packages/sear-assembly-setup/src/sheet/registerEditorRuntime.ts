import {
  SheetRangeMoveRegistry,
  SheetRangeReorderRegistry,
  SheetStructureMoveRegistry,
} from '@searsuite/sear-assembly-plugin';
import { type SearCoreSheet } from '@searsuite/sear-assembly-core';
import { SheetCommandBus, SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { createDefaultCellFormatLocaleProvider, ICellFormatLocaleProvider } from '@searsuite/sear-domain-cell-types';
import { type Container, Scope } from '@searsuite/sear-foundation-di';
import { FileDownload, UnavailableFileDownload, Platform } from '@searsuite/sear-foundation-platform';
import { ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import {
  type CellProperties,
  NodeFactory,
  RenderCoordinatorManager,
  RendererRegistry,
  SheetCellVisualReaderRegistry,
  SheetNodeFactory,
  SheetRenderCoordinatorManager,
  SheetRendererRegistry,
} from '@searsuite/sear-render-registry';
import { CoordinateTransformer, RenderContext } from '@searsuite/sear-render-context';
import { CoordinateEngine } from '@searsuite/sear-render-coord';
import { EventEngine, EventRegistrar } from '@searsuite/sear-render-event-engine';
import { SheetRenderEngine } from '@searsuite/sear-render-engine';
import { SceneGraph } from '@searsuite/sear-render-node';
import { RenderContextTextShaper, TextShaper } from '@searsuite/sear-render-metrics';
import { ScrollManager, Scroller, type ScrollPublisher } from '@searsuite/sear-render-scroll';
import {
  DirtyRenderStrategy,
  EventRenderStrategy,
  HitRenderStrategy,
  OverlayRenderStrategy,
  RasterCopyExecutor,
  RenderStrategyManager,
  ScreenRenderStrategy,
  StickyRenderStrategy,
} from '@searsuite/sear-render-strategy';
import { PluginManager } from '@searsuite/sear-assembly-plugin';
import { SearFormulaBar, SearToolbar } from '@searsuite/sear-assembly-plugin';
import { UserInteractionService } from '@searsuite/sear-foundation-user-interaction';
import { type SheetEditorAdapters } from './SheetEditorContracts';
import { InMemorySheetClipboard, SheetClipboard, SheetClipboardCutSession, SheetClipboardSheetIdentity } from '@searsuite/sear-plugin-clipboard';
import { NoopSheetExternalHistory, SheetExternalHistory } from '@searsuite/sear-plugin-history';
import {
  SheetEmbeddedEditor,
  type SheetDocument,
  type SheetEmbeddedEditorContext,
} from '@searsuite/sear-sheet-editor-contract';

/** Runtime services assembled after base services and host adapters are available. */
export interface EditorRuntime {
  /** Render contexts for visible, off-screen, and hit-test layers. */
  readonly renderContexts: {
    readonly main: RenderContext;
    readonly offScreen: RenderContext;
    readonly hit: RenderContext;
  };
  /** Cell renderer registry exposed to plugins and cell definitions. */
  readonly rendererRegistry: SheetRendererRegistry<CellProperties>;
  /** Host scroller adapter instance. */
  readonly scroller: Scroller;
  /** Scroll manager coordinating sheet viewport state. */
  readonly scrollManager: ScrollManager;
  /** Optional host-provided editor for rich text embedded in Sheet cells. */
  readonly embeddedEditor?: SheetEmbeddedEditor | undefined;
  /** Sheet plugin manager populated by feature registration. */
  readonly pluginManager: PluginManager<SearCoreSheet, CellProperties>;
}

/**
 * Registers render contexts, rendering strategies, event services, and command/runtime singletons.
 * @param container - Assembly DI container.
 * @param adapters - Platform adapters supplied by the host.
 * @param viewport - Initial viewport dimensions.
 * @param devicePixelRatio - Raster scale used to initialize render contexts.
 * @returns Runtime services created or resolved during registration.
 */
export function registerEditorRuntime(
  container: Container,
  adapters: SheetEditorAdapters,
  viewport: { width: number; height: number },
  devicePixelRatio: number,
): EditorRuntime {
  const { renderContext, offScreenRenderContext, hitRenderContext } = adapters.createRenderContexts();
  renderContext.initialize(devicePixelRatio);
  offScreenRenderContext.initialize(devicePixelRatio);
  hitRenderContext.initialize(devicePixelRatio);
  container.registerInstance(RenderContext.symbol, renderContext);
  container.registerInstance(RenderContext.offScreenSymbol, offScreenRenderContext);
  container.registerInstance(RenderContext.hitSymbol, hitRenderContext);
  if (!container.hasBinding(ICellFormatLocaleProvider.symbol)) {
    container.registerInstance(ICellFormatLocaleProvider.symbol, createDefaultCellFormatLocaleProvider());
  }
  const textShaper = adapters.createTextShaper?.(renderContext) ?? new RenderContextTextShaper(renderContext);
  container.registerInstance(TextShaper.symbol, textShaper);
  container.registerInstance(NodeFactory.symbol, new SheetNodeFactory());
  const rendererRegistry = new SheetRendererRegistry<CellProperties>();
  container.registerInstance(RendererRegistry.symbol, rendererRegistry);
  container.register(SheetCellVisualReaderRegistry.symbol, SheetCellVisualReaderRegistry, Scope.Singleton);
  container.register(SheetRangeMoveRegistry.symbol, SheetRangeMoveRegistry, Scope.Singleton);
  container.register(SheetRangeReorderRegistry.symbol, SheetRangeReorderRegistry, Scope.Singleton);
  container.register(SheetStructureMoveRegistry.symbol, SheetStructureMoveRegistry, Scope.Singleton);
  container.register(SheetRenderCoordinatorManager.symbol, SheetRenderCoordinatorManager, Scope.Singleton);
  container.registerFactory(
    RenderCoordinatorManager.symbol,
    () => container.resolve(SheetRenderCoordinatorManager.symbol),
    Scope.Singleton,
  );
  container.register(Scroller.symbol, adapters.scroller, Scope.Singleton);
  const scroller = container.resolve<Scroller & { getPublisher(): ScrollPublisher }>(Scroller.symbol);
  const scrollManager = new ScrollManager(viewport.width, viewport.height);
  scrollManager.addPublisher(scroller.getPublisher());
  container.registerInstance(ScrollManager.symbol, scrollManager);
  container.register(CoordinateTransformer.symbol, CoordinateTransformer, Scope.Singleton);
  container.register(CoordinateEngine.symbol, CoordinateEngine, Scope.Singleton);
  container.register(SheetCommandBus.symbol, SheetCommandBus, Scope.Singleton);
  const embeddedEditor = container.hasBinding(SheetEmbeddedEditor.symbol)
    ? container.resolve<SheetEmbeddedEditor>(SheetEmbeddedEditor.symbol)
    : undefined;
  if (embeddedEditor) {
    const commands = container.resolve<SheetCommandBus>(SheetCommandBus.symbol);
    initializeEmbeddedEditor(embeddedEditor, renderContext, viewport, () => commands.isExecuting());
  }
  container.register(RenderStrategyManager.symbol, RenderStrategyManager, Scope.Singleton);
  container.register(RasterCopyExecutor.symbol, RasterCopyExecutor, Scope.Singleton);
  container.register(ScreenRenderStrategy.symbol, ScreenRenderStrategy, Scope.Singleton);
  container.register(DirtyRenderStrategy.symbol, DirtyRenderStrategy, Scope.Singleton);
  container.register(StickyRenderStrategy.symbol, StickyRenderStrategy, Scope.Singleton);
  container.register(OverlayRenderStrategy.symbol, OverlayRenderStrategy, Scope.Singleton);
  container.register(SheetRenderEngine.symbol, SheetRenderEngine);
  container.register(EventRenderStrategy.symbol, EventRenderStrategy, Scope.Singleton);
  container.register(HitRenderStrategy.symbol, HitRenderStrategy, Scope.Singleton);
  container.register(EventRegistrar.symbol, adapters.eventRegistrar, Scope.Singleton);
  if (!container.hasBinding(FileDownload.symbol)) {
    container.register(FileDownload.symbol, adapters.fileDownload ?? UnavailableFileDownload, Scope.Singleton);
  }
  container.register(SearToolbar.symbol, adapters.toolbar, Scope.Singleton);
  if (adapters.formulaBar) container.register(SearFormulaBar.symbol, adapters.formulaBar, Scope.Singleton);
  if (adapters.userInteraction)
    container.register(UserInteractionService.symbol, adapters.userInteraction, Scope.Singleton);
  container.register(SheetClipboard.symbol, adapters.clipboard ?? InMemorySheetClipboard, Scope.Singleton);
  if (!container.hasBinding(SheetClipboardCutSession.symbol))
    container.registerInstance(SheetClipboardCutSession.symbol, new SheetClipboardCutSession());
  if (!container.hasBinding(SheetClipboardSheetIdentity.symbol))
    container.registerInstance(SheetClipboardSheetIdentity.symbol,
      new SheetClipboardSheetIdentity(container.resolve<Platform>(Platform.symbol).createId('sheet-clipboard-source')));
  if (!container.hasBinding(SheetExternalHistory.symbol))
    container.registerInstance(SheetExternalHistory.symbol, new NoopSheetExternalHistory());
  container.register(EventEngine.symbol, EventEngine, Scope.Singleton);
  container.register(SheetQueryRegistry.symbol, SheetQueryRegistry, Scope.Singleton);
  container.register(ObservationRegistry.symbol, ObservationRegistry, Scope.Singleton);
  container.registerFactory(
    PluginManager.symbol,
    () => new PluginManager<SearCoreSheet, CellProperties>(container.resolve<Platform>(Platform.symbol)),
    Scope.Singleton,
  );
  const pluginManager = container.resolve<PluginManager<SearCoreSheet, CellProperties>>(PluginManager.symbol);
  return {
    renderContexts: { main: renderContext, offScreen: offScreenRenderContext, hit: hitRenderContext },
    rendererRegistry,
    scroller,
    scrollManager,
    embeddedEditor,
    pluginManager,
  };
}

/** Starts the host-provided editor once the Sheet render context is ready. */
function initializeEmbeddedEditor(
  editor: SheetEmbeddedEditor,
  renderContext: RenderContext,
  viewport: { width: number; height: number },
  isCommandExecuting: () => boolean,
): void {
  let document: SheetDocument = [];
  const context: SheetEmbeddedEditorContext = {
    renderContext,
    isCommandExecuting,
    geometry: {
      cellRect: { x: 0, y: 0, width: viewport.width, height: viewport.height },
      toLocalPoint: (point) => ({ x: point.x, y: point.y }),
      toSheetPoint: (point) => ({ x: point.x, y: point.y }),
    },
    documentAccessor: {
      read: () => document,
      commit: (nextDocument) => {
        document = [...nextDocument];
      },
    },
  };
  editor.initialize(context);
}
