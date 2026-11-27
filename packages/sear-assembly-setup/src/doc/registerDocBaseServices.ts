import { SearError } from '@searsuite/sear-foundation-error';
import { DocCompositionManager, DocCursorManager, SearCoreDoc } from '@searsuite/sear-assembly-core';
import { DocInputPlugin } from '@searsuite/sear-assembly-doc';
import { PipelineStepExecutorRegistry } from '@searsuite/sear-assembly-plugin';
import { ConfigEngine, defaultDocConfig, type DocConfig, type EditorDefaultConfigOverrides } from '@searsuite/sear-assembly-config';
import { PluginManager, SessionStateRegistry } from '@searsuite/sear-assembly-plugin';
import { DocNodeRegistry, RichTextInlineStyleRegistry, RichTextLineBoxRegistry, RichTextBlockFlowRegistry, type RichTextParagraphLayoutDefaults } from '@searsuite/sear-domain-doc';
import { DocLayoutEngine } from '@searsuite/sear-domain-editor';
import { type Container, Scope } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';
import { PositionRect } from '@searsuite/sear-foundation-rect';
import { DataStorage, MapDataStorageFactory } from '@searsuite/sear-foundation-storage';
import { TextShaper } from '@searsuite/sear-render-metrics';
import { ObservationRegistry, SubscriptionManager } from '@searsuite/sear-foundation-subscription';
import { Container as RenderContainer, DirtyTree, FrameDirtyTracker, HitColorRegistry, QuadTreeFactory, SceneGraph, Tree, BlockManager, RichTextLineRenderer, RichTextRunRenderRegistry, RichTextRunRenderer, type Node, type NodeProperties, type RenderNodeKey, type RichTextRenderNodeProperties } from '@searsuite/sear-render-node';
import { EventEngine, ViewExtensionRegistry } from '@searsuite/sear-render-event-engine';
import { DocRenderEngine } from '@searsuite/sear-render-engine';
import { RenderCoordinatorManager } from '@searsuite/sear-render-registry';
import { type DocEditorAdapters, type DocEditorViewport } from './createDocEditor';
import { DocDocumentSessionCoordinator } from './DocDocumentSessionCoordinator';
import { DocEditorLifecycleState } from './DocEditorLifecycleState';
import { DocInputAdapterLifecycle } from './DocInputAdapterLifecycle';
import { DocInputBindingRegistry } from './DocInputBindingRegistry';
import { DocPointerCoordinateMapper } from './DocPointerCoordinateMapper';
import { DocRenderCoordinator } from './DocRenderCoordinator';
import { DocRenderLayoutService } from './DocRenderLayoutService';
import { DocRuntimeExtensionRegistry } from '@searsuite/sear-assembly-doc';
import { DocViewportEnvironment } from './DocViewportEnvironment';
import { createDocFontDescriptor } from './createDocFontDescriptor';

/** Base service instances created before runtime adapters and plugins are wired. */
export interface DocBaseServices {
  /** Configuration engine registered in the DI container. */
  readonly configEngine: ConfigEngine;
  /** Scene graph that owns standalone document content render nodes. */
  readonly stage: SceneGraph<RichTextRenderNodeProperties>;
}

/** Registers document editor base services into the DI container. */
export function registerDocBaseServices(
  container: Container,
  adapters: DocEditorAdapters,
  _viewport: DocEditorViewport,
  defaultConfigOverrides?: EditorDefaultConfigOverrides<DocConfig>,
): DocBaseServices {
  container.register(ViewExtensionRegistry.symbol, ViewExtensionRegistry, Scope.Singleton);
  const configEngine = new ConfigEngine(defaultDocConfig, defaultConfigOverrides);
  container.registerInstance(ConfigEngine.symbol, configEngine);
  container.registerFactory(
    Tree.symbol,
    () => new QuadTreeFactory().create(new PositionRect(0, 0, 1, 1), 16),
    Scope.Singleton,
  );
  container.registerFactory(
    DirtyTree.symbol,
    () => new QuadTreeFactory().create(new PositionRect(0, 0, 0, 0), 16),
    Scope.Singleton,
  );
  container.registerFactory(
    FrameDirtyTracker.symbol,
    () => new FrameDirtyTracker(container.resolve(DirtyTree.symbol)),
    Scope.Singleton,
  );
  container.registerFactory<DataStorage<RenderNodeKey, RenderContainer>>(
    DataStorage.symbol,
    () => new MapDataStorageFactory<RenderNodeKey, RenderContainer>().create(),
    Scope.Singleton,
  );
  container.register(HitColorRegistry.symbol, HitColorRegistry, Scope.Singleton);
  container.register(SubscriptionManager.symbol, SubscriptionManager, Scope.Prototype);
  container.register(ObservationRegistry.symbol, ObservationRegistry, Scope.Singleton);
  container.register(SessionStateRegistry.symbol, SessionStateRegistry, Scope.Singleton);
  container.register(PipelineStepExecutorRegistry.symbol, PipelineStepExecutorRegistry, Scope.Singleton);
  container.registerFactory(
    RenderCoordinatorManager.symbol,
    () => new DocNoopRenderCoordinatorManager(),
    Scope.Singleton,
  );
  container.registerFactory(
    BlockManager.symbol,
    () =>
      new BlockManager(
        container.resolve(TextShaper.symbol),
        container.resolve(RichTextInlineStyleRegistry.symbol),
        container.resolve(RichTextRunRenderRegistry.symbol),
        container.resolve(RichTextLineBoxRegistry.symbol),
        createDocFontDescriptor(configEngine.getDefaultConfig()),
        createDocParagraphLayoutDefaults(configEngine.getDefaultConfig()),
      ),
    Scope.Prototype,
  );
  container.register(RichTextInlineStyleRegistry.symbol, RichTextInlineStyleRegistry, Scope.Singleton);
  container.register(RichTextLineBoxRegistry.symbol, RichTextLineBoxRegistry, Scope.Singleton);
  container.registerFactory(
    RichTextBlockFlowRegistry.symbol,
    () => new RichTextBlockFlowRegistry(configEngine.getDefaultConfig().docParagraphSpacingAfter),
    Scope.Singleton,
  );
  container.register(RichTextRunRenderRegistry.symbol, RichTextRunRenderRegistry, Scope.Singleton);
  container.registerFactory(
    RichTextRunRenderer.symbol,
    () => new RichTextRunRenderer(container.resolve(RichTextRunRenderRegistry.symbol)),
    Scope.Singleton,
  );
  container.registerFactory(
    RichTextLineRenderer.symbol,
    () =>
      new RichTextLineRenderer(
        container.resolve(RichTextInlineStyleRegistry.symbol),
        container.resolve(RichTextRunRenderer.symbol),
      ),
    Scope.Singleton,
  );
  container.register(DocNodeRegistry.symbol, DocNodeRegistry, Scope.Singleton);
  container.register(DocLayoutEngine.symbol, DocLayoutEngine, Scope.Singleton);
  container.register(DocCursorManager.symbol, DocCursorManager, Scope.Singleton);
  container.register(DocCompositionManager.symbol, DocCompositionManager, Scope.Singleton);
  container.register(DocInputPlugin.symbol, DocInputPlugin, Scope.Singleton);
  container.register(DocRuntimeExtensionRegistry.symbol, DocRuntimeExtensionRegistry, Scope.Singleton);
  container.register(DocInputBindingRegistry.symbol, DocInputBindingRegistry, Scope.Singleton);
  container.register(DocEditorLifecycleState.symbol, DocEditorLifecycleState, Scope.Singleton);
  container.register(DocDocumentSessionCoordinator.symbol, DocDocumentSessionCoordinator, Scope.Singleton);
  container.register(DocViewportEnvironment.symbol, DocViewportEnvironment, Scope.Singleton);
  container.register(DocInputAdapterLifecycle.symbol, DocInputAdapterLifecycle, Scope.Singleton);
  container.register(DocPointerCoordinateMapper.symbol, DocPointerCoordinateMapper, Scope.Singleton);
  container.register(DocRenderLayoutService.symbol, DocRenderLayoutService, Scope.Singleton);
  container.register(DocRenderCoordinator.symbol, DocRenderCoordinator, Scope.Singleton);
  container.register(Platform.symbol, adapters.platform, Scope.Singleton);
  container.registerFactory(
    SearCoreDoc.pluginManagerSymbol,
    () => container.resolve<PluginManager>(PluginManager.symbol),
    Scope.Singleton,
  );
  container.registerFactory(
    SearCoreDoc.runtimeLayersSymbol,
    () => ({
      renderStage: container.resolve<SceneGraph<NodeProperties>>(SceneGraph.symbol),
      renderEngine: container.resolve<DocRenderEngine>(DocRenderEngine.symbol),
      eventEngine: container.resolve<EventEngine<NodeProperties>>(EventEngine.symbol),
      configEngine: container.resolve<ConfigEngine>(ConfigEngine.symbol),
      platform: container.resolve<Platform>(Platform.symbol),
    }),
    Scope.Singleton,
  );
  container.register(SearCoreDoc.symbol, SearCoreDoc, Scope.Singleton);
  const stage = new SceneGraph<RichTextRenderNodeProperties>(container);
  container.registerInstance(SceneGraph.symbol, stage);

  return { configEngine, stage };
}

function createDocParagraphLayoutDefaults(config: DocConfig): RichTextParagraphLayoutDefaults {
  return {
    lineSpacing: { mode: 'multiple', value: config.docLineHeightMultiplier },
    spacingAfter: config.docParagraphSpacingAfter,
  };
}

class DocNoopRenderCoordinatorManager extends RenderCoordinatorManager {
  public registerType(): void {}

  public registerRenderer(): void {}

  public create<T>(): T {
    throw new SearError('Doc render coordinator manager does not create sheet cells.');
  }

  public renderCell<T extends NodeProperties>(): Node<T> | Node<T>[] {
    throw new SearError('Doc render coordinator manager does not render sheet cells.');
  }

  public render<T extends NodeProperties>(): Node<T> | Node<T>[] {
    throw new SearError('Doc render coordinator manager does not render sheet cells.');
  }
}
