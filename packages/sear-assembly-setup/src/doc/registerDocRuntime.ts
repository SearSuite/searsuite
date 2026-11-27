import { DocCommandBus } from '@searsuite/sear-assembly-commands';
import { ConfigEngine } from '@searsuite/sear-assembly-config';
import { PluginManager } from '@searsuite/sear-assembly-plugin';
import { type Container, Scope } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';
import { CoordinateTransformer, RenderContext } from '@searsuite/sear-render-context';
import { EventEngine, EventRegistrar, HeadlessEventRegistrar } from '@searsuite/sear-render-event-engine';
import { KeyboardRouter, PointerCapture, TextInput } from '@searsuite/sear-render-input';
import { type NodeProperties } from '@searsuite/sear-render-node';
import { DocRenderEngine, RenderEngine } from '@searsuite/sear-render-engine';
import { Scroller, ScrollManager, type ScrollPublisher } from '@searsuite/sear-render-scroll';
import { DirtyRenderStrategy, EventRenderStrategy, HitRenderStrategy, IncrementalRenderPolicy, OverlayRenderStrategy, RasterCopyExecutor, RenderStrategyManager, ScreenRenderStrategy, StickyRenderStrategy } from '@searsuite/sear-render-strategy';

import { RenderContextTextShaper, TextMeasurementManager, TextShaper } from '@searsuite/sear-render-metrics';
import { type DocEditorAdapters, type DocEditorViewport } from './createDocEditor';
import { DocVirtualLayoutStore } from './DocVirtualLayoutStore';
import { createDocFontDescriptor } from './createDocFontDescriptor';

/** Runtime services assembled after Doc base services and host environment values are available. */
export interface DocRuntime {
  /** Render contexts for visible, off-screen, and hit-test layers. */
  readonly renderContexts: {
    readonly main: RenderContext;
    readonly offScreen: RenderContext;
    readonly hit: RenderContext;
  };
  /** Scroll manager coordinating document viewport state. */
  readonly scrollManager: ScrollManager;
  /** Document render engine populated with the shared Sheet-like strategy chain. */
  readonly renderEngine: DocRenderEngine;
  /** Event pipeline and hit-testing facade for document interactions. */
  readonly eventEngine: EventEngine<NodeProperties>;
  /** Event registrar selected by the host or the headless fallback. */
  readonly eventRegistrar: EventRegistrar;
  /** Document plugin manager populated by feature registration. */
  readonly pluginManager: PluginManager;
}

/** Registers render, input, scroll, command, and plugin runtime services for Doc. */
export function registerDocRuntime(
  container: Container,
  adapters: DocEditorAdapters,
  viewport: DocEditorViewport,
): DocRuntime {
  const configEngine = container.resolve<ConfigEngine>(ConfigEngine.symbol);
  const defaultConfig = configEngine.getDefaultConfig();
  const font = createDocFontDescriptor(defaultConfig);
  const devicePixelRatio = defaultConfig.devicePixelRatio;
  const renderContext = adapters.createRenderContext();
  renderContext.initialize(devicePixelRatio);
  renderContext.setFont(font);
  renderContext.resize(viewport.width, viewport.height, devicePixelRatio);

  const offScreenRenderContext = renderContext.cloneNode();
  offScreenRenderContext.initialize(devicePixelRatio);
  offScreenRenderContext.setFont(font);
  offScreenRenderContext.resize(viewport.width, viewport.height, devicePixelRatio);

  const hitRenderContext = renderContext.createHitNode();
  hitRenderContext.initialize(devicePixelRatio);
  hitRenderContext.setFont(font);
  hitRenderContext.resize(viewport.width, viewport.height, devicePixelRatio);

  container.registerInstance(RenderContext.symbol, renderContext);
  const textShaper = adapters.createTextShaper?.(renderContext) ?? new RenderContextTextShaper(renderContext);
  container.registerInstance(TextShaper.symbol, textShaper);
  container.registerFactory(
    TextMeasurementManager.symbol,
    () => new TextMeasurementManager(textShaper),
    Scope.Singleton,
  );
  container.registerInstance(RenderContext.offScreenSymbol, offScreenRenderContext);
  container.registerInstance(RenderContext.hitSymbol, hitRenderContext);
  const scrollManager = new ScrollManager(viewport.width, viewport.height);
  if (adapters.scroller) {
    container.register(Scroller.symbol, adapters.scroller, Scope.Singleton);
    const scroller = container.resolve<Scroller & { getPublisher(): ScrollPublisher }>(Scroller.symbol);
    scrollManager.addPublisher(scroller.getPublisher());
  }
  container.registerInstance(ScrollManager.symbol, scrollManager);
  container.register(CoordinateTransformer.symbol, CoordinateTransformer, Scope.Singleton);
  container.register(TextInput.symbol, adapters.textInput, Scope.Singleton);
  container.register(KeyboardRouter.symbol, adapters.keyboardRouter, Scope.Singleton);
  container.register(PointerCapture.symbol, adapters.pointerCapture, Scope.Singleton);
  container.register(RenderStrategyManager.symbol, RenderStrategyManager, Scope.Singleton);
  container.register(RasterCopyExecutor.symbol, RasterCopyExecutor, Scope.Singleton);
  container.register(IncrementalRenderPolicy.symbol, IncrementalRenderPolicy, Scope.Singleton);
  container.register(ScreenRenderStrategy.symbol, ScreenRenderStrategy, Scope.Singleton);
  container.register(DocVirtualLayoutStore.symbol, DocVirtualLayoutStore, Scope.Singleton);
  container.register(DirtyRenderStrategy.symbol, DirtyRenderStrategy, Scope.Singleton);
  container.register(StickyRenderStrategy.symbol, StickyRenderStrategy, Scope.Singleton);
  container.register(OverlayRenderStrategy.symbol, OverlayRenderStrategy, Scope.Singleton);
  container.register(DocRenderEngine.symbol, DocRenderEngine, Scope.Singleton);
  container.registerFactory(
    RenderEngine.symbol,
    () => container.resolve<DocRenderEngine>(DocRenderEngine.symbol),
    Scope.Singleton,
  );
  container.register(EventRenderStrategy.symbol, EventRenderStrategy, Scope.Singleton);
  container.register(HitRenderStrategy.symbol, HitRenderStrategy, Scope.Singleton);
  container.register(EventRegistrar.symbol, adapters.eventRegistrar ?? HeadlessEventRegistrar, Scope.Singleton);
  container.register(EventEngine.symbol, EventEngine, Scope.Singleton);
  container.register(DocCommandBus.symbol, DocCommandBus, Scope.Singleton);
  container.registerFactory(
    PluginManager.symbol,
    () => new PluginManager(container.resolve<Platform>(Platform.symbol)),
    Scope.Singleton,
  );

  const eventEngine = container.resolve<EventEngine<NodeProperties>>(EventEngine.symbol);
  const eventRegistrar = container.resolve<EventRegistrar>(EventRegistrar.symbol);

  return {
    renderContexts: {
      main: renderContext,
      offScreen: offScreenRenderContext,
      hit: hitRenderContext,
    },
    scrollManager,
    renderEngine: container.resolve<DocRenderEngine>(DocRenderEngine.symbol),
    eventEngine,
    eventRegistrar,
    pluginManager: container.resolve<PluginManager>(PluginManager.symbol),
  };
}
