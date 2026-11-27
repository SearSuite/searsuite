import { registerSheetBaseServices } from '@searsuite/sear-assembly-sheet-kernel';
import { ConfigEngine, type EditorDefaultConfigOverrides, type SheetConfig } from '@searsuite/sear-assembly-config';

import { SheetLifecycleCoordinator, SheetViewportResizeController } from '@searsuite/sear-assembly-core';

import { type Container, Scope } from '@searsuite/sear-foundation-di';

import { PositionRect } from '@searsuite/sear-foundation-rect';
import { DataStorage, MapDataStorageFactory } from '@searsuite/sear-foundation-storage';

import { Container as RenderContainer, DirtyTree, FrameDirtyTracker, HitColorRegistry, QuadTreeFactory, SceneGraph, Tree, type RenderNodeKey } from '@searsuite/sear-render-node';

import { SheetDataEngine } from '@searsuite/sear-domain-sheet';
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
  adapters: Pick<
    SheetEditorAdapters,
    'platform' | 'xmlDocumentParser' | 'xmlXPathEngine' | 'xmlXPathEvaluator' | 'webServiceClient'
  >,
  viewport: { width: number; height: number },
  defaultConfigOverrides: EditorDefaultConfigOverrides<SheetConfig> = {},
): EditorBaseServices {
  const { configEngine, dataEngine } = registerSheetBaseServices(container, adapters, defaultConfigOverrides);
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
    FrameDirtyTracker.symbol,
    () => new FrameDirtyTracker(container.resolve(DirtyTree.symbol)),
    Scope.Singleton,
  );
  container.register(SheetLifecycleCoordinator.symbol, SheetLifecycleCoordinator, Scope.Singleton);
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
  const stage = new SceneGraph<CellProperties>(container);
  container.registerInstance(SceneGraph.symbol, stage);
  return { configEngine, dataEngine, stage };
}
