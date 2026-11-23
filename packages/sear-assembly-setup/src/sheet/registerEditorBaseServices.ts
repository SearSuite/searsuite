import {
  ConfigEngine,
  defaultSheetConfig,
  type EditorDefaultConfigOverrides,
  type SheetConfig,
} from '@searsuite/sear-assembly-config';
import { SessionStateRegistry, SheetClipboardTransferRegistry, SheetFormatTransferRegistry } from '@searsuite/sear-assembly-plugin';
import {
  PipelineStepExecutorRegistry,
  SheetInteractionReducerRegistry,
  SheetInteractionStore,
  SheetLifecycleCoordinator,
  SheetViewportResizeController,
} from '@searsuite/sear-assembly-core';
import { type Container, Scope } from '@searsuite/sear-foundation-di';
import {
  UnavailableWebServiceClient,
  UnavailableXmlDocumentParser,
  UnavailableXmlXPathEngine,
  Platform,
  WebServiceClient,
  XmlDocumentParser,
  XmlXPathEngine,
  XmlXPathEvaluator,
} from '@searsuite/sear-foundation-platform';
import { PositionRect } from '@searsuite/sear-foundation-rect';
import { DataStorage, MapDataStorageFactory } from '@searsuite/sear-foundation-storage';
import { SubscriptionManager } from '@searsuite/sear-foundation-subscription';
import { SheetDisplayedValueChanges } from '@searsuite/sear-domain-cell-types';
import {
  Container as RenderContainer,
  DirtyTree,
  GenerationalDirtyTracker,
  HitColorRegistry,
  QuadTreeFactory,
  SceneGraph,
  Tree,
  type RenderNodeKey,
} from '@searsuite/sear-render-node';
import { DataEngine, SheetDataEngine } from '@searsuite/sear-render-engine';
import { type CellProperties } from '@searsuite/sear-render-registry';
import { type SheetEditorAdapters } from './SheetEditorContracts';

/** Base service instances created before runtime adapters and plugins are wired. */
export interface EditorBaseServices {
  /** Configuration engine registered in the DI container. */
  readonly configEngine: ConfigEngine;
  /** Sheet data engine registered under the abstract DataEngine token. */
  readonly dataEngine: SheetDataEngine;
  /** Scene graph that owns plugin render nodes. */
  readonly stage: SceneGraph<CellProperties>;
}

/**
 * Registers core editor base services into the DI container.
 * @param container - Assembly DI container.
 * @param adapters - Platform adapters supplied by the host.
 * @param viewport - Initial viewport dimensions used to size spatial indexes.
 * @returns The concrete base service instances created by this function.
 */
export function registerEditorBaseServices(
  container: Container,
  adapters: Pick<SheetEditorAdapters,
    'platform' | 'xmlDocumentParser' | 'xmlXPathEngine' | 'xmlXPathEvaluator' | 'webServiceClient'>,
  viewport: { width: number; height: number },
  defaultConfigOverrides: EditorDefaultConfigOverrides<SheetConfig> = {},
): EditorBaseServices {
  container.registerFactory(
    Tree.symbol,
    () => new QuadTreeFactory().create(new PositionRect(0, 0, viewport.width, viewport.height), 16),
    Scope.Singleton,
  );
  container.registerFactory(
    DirtyTree.symbol,
    () => new QuadTreeFactory().create(new PositionRect(0, 0, 0, 0), 16),
    Scope.Singleton,
  );
  container.registerFactory(
    GenerationalDirtyTracker.symbol,
    () => new GenerationalDirtyTracker(container.resolve(DirtyTree.symbol)),
    Scope.Singleton,
  );
  container.register(Platform.symbol, adapters.platform, Scope.Singleton);
  container.registerFactory(
    SheetDisplayedValueChanges.symbol,
    () => new SheetDisplayedValueChanges((error) =>
      container.resolve<Platform>(Platform.symbol).warn('Sheet displayed-value change listener failed.', error)),
    Scope.Singleton,
  );
  container.register(XmlDocumentParser.symbol, adapters.xmlDocumentParser ?? UnavailableXmlDocumentParser, Scope.Singleton);
  container.register(XmlXPathEngine.symbol, adapters.xmlXPathEngine ?? UnavailableXmlXPathEngine, Scope.Singleton);
  if (adapters.xmlXPathEvaluator) {
    container.register(XmlXPathEvaluator.symbol, adapters.xmlXPathEvaluator, Scope.Singleton);
  } else {
    container.registerFactory(
      XmlXPathEvaluator.symbol,
      () => new XmlXPathEvaluator(
        container.resolve<XmlDocumentParser>(XmlDocumentParser.symbol),
        container.resolve<XmlXPathEngine>(XmlXPathEngine.symbol),
      ),
      Scope.Singleton,
    );
  }
  container.register(WebServiceClient.symbol, adapters.webServiceClient ?? UnavailableWebServiceClient, Scope.Singleton);
  container.register(SubscriptionManager.symbol, SubscriptionManager, Scope.Prototype);
  container.register(SheetLifecycleCoordinator.symbol, SheetLifecycleCoordinator, Scope.Singleton);
  container.register(SessionStateRegistry.symbol, SessionStateRegistry, Scope.Singleton);
  container.registerInstance(SheetFormatTransferRegistry.symbol, new SheetFormatTransferRegistry());
  container.registerInstance(SheetClipboardTransferRegistry.symbol, new SheetClipboardTransferRegistry());
  container.register(SheetInteractionStore.symbol, SheetInteractionStore, Scope.Singleton);
  container.register(SheetInteractionReducerRegistry.symbol, SheetInteractionReducerRegistry, Scope.Singleton);
  container.register(PipelineStepExecutorRegistry.symbol, PipelineStepExecutorRegistry, Scope.Singleton);
  container.register(SheetViewportResizeController.symbol, SheetViewportResizeController, Scope.Singleton);
  container
    .resolve<SheetLifecycleCoordinator>(SheetLifecycleCoordinator.symbol)
    .register(container.resolve<SheetViewportResizeController>(SheetViewportResizeController.symbol));
  container.registerFactory<DataStorage<RenderNodeKey, RenderContainer>>(
    DataStorage.symbol,
    () => new MapDataStorageFactory<RenderNodeKey, RenderContainer>().create(),
    Scope.Singleton,
  );
  container.register(HitColorRegistry.symbol, HitColorRegistry, Scope.Singleton);
  const dataEngine = new SheetDataEngine();
  container.registerInstance(DataEngine.symbol, dataEngine);
  const configEngine = new ConfigEngine(defaultSheetConfig, defaultConfigOverrides);
  container.registerInstance(ConfigEngine.symbol, configEngine);
  const stage = new SceneGraph<CellProperties>(container);
  container.registerInstance(SceneGraph.symbol, stage);
  return { configEngine, dataEngine, stage };
}
