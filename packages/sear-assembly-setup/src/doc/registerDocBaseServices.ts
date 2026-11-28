import { ConfigEngine, type DocConfig, type EditorDefaultConfigOverrides } from '@searsuite/sear-assembly-config';
import { DocCompositionManager, DocCursorManager, SearCoreDoc } from '@searsuite/sear-assembly-core';
import { PluginManager } from '@searsuite/sear-assembly-plugin';
import {
  DocNodeRegistry,
  RichTextInlineStyleRegistry,
  RichTextLineBoxRegistry,
  type RichTextParagraphLayoutDefaults,
} from '@searsuite/sear-domain-doc';
import { Scope, type Container } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';
import { PositionRect } from '@searsuite/sear-foundation-rect';
import { DataStorage, MapDataStorageFactory } from '@searsuite/sear-foundation-storage';
import { SubscriptionManager } from '@searsuite/sear-foundation-subscription';
import { DocRenderEngine } from '@searsuite/sear-render-engine';
import { EventEngine, ViewExtensionRegistry } from '@searsuite/sear-render-event-engine';
import { TextShaper } from '@searsuite/sear-render-metrics';
import {
  BlockManager,
  DirtyTree,
  FrameDirtyTracker,
  HitColorRegistry,
  QuadTreeFactory,
  Container as RenderContainer,
  RichTextLineRenderer,
  RichTextRunRenderRegistry,
  RichTextRunRenderer,
  SceneGraph,
  Tree,
  type NodeProperties,
  type RenderNodeKey,
  type RichTextRenderNodeProperties,
} from '@searsuite/sear-render-node';
import { DocEditorLifecycleState } from './DocEditorLifecycleState';
import { DocInputAdapterLifecycle } from './DocInputAdapterLifecycle';
import { DocInputBindingRegistry } from './DocInputBindingRegistry';
import { DocPointerCoordinateMapper } from './DocPointerCoordinateMapper';
import { DocRenderCoordinator } from './DocRenderCoordinator';
import { DocRenderLayoutService } from './DocRenderLayoutService';
import { DocViewportEnvironment } from './DocViewportEnvironment';
import { type DocEditorAdapters, type DocEditorViewport } from './createDocEditor';
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
  _adapters: DocEditorAdapters,
  _viewport: DocEditorViewport,
  _defaultConfigOverrides?: EditorDefaultConfigOverrides<DocConfig>,
): DocBaseServices {
  container.register(ViewExtensionRegistry.symbol, ViewExtensionRegistry, Scope.Singleton);
  const configEngine = container.resolve<ConfigEngine>(ConfigEngine.symbol);
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
  container.register(DocCursorManager.symbol, DocCursorManager, Scope.Singleton);
  container.register(DocCompositionManager.symbol, DocCompositionManager, Scope.Singleton);
  container.register(DocInputBindingRegistry.symbol, DocInputBindingRegistry, Scope.Singleton);
  container.register(DocEditorLifecycleState.symbol, DocEditorLifecycleState, Scope.Singleton);
  container.register(DocViewportEnvironment.symbol, DocViewportEnvironment, Scope.Singleton);
  container.register(DocInputAdapterLifecycle.symbol, DocInputAdapterLifecycle, Scope.Singleton);
  container.register(DocPointerCoordinateMapper.symbol, DocPointerCoordinateMapper, Scope.Singleton);
  container.register(DocRenderLayoutService.symbol, DocRenderLayoutService, Scope.Singleton);
  container.register(DocRenderCoordinator.symbol, DocRenderCoordinator, Scope.Singleton);
  container.registerFactory(
    SearCoreDoc.pluginManagerSymbol,
    () => container.resolve<PluginManager>(PluginManager.symbol),
    Scope.Singleton,
  );
  container.registerFactory(
    SearCoreDoc.runtimeLayersSymbol,
    () => ({
      nodes: container.resolve<DocNodeRegistry>(DocNodeRegistry.symbol),
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
