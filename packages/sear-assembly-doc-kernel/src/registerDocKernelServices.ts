import { DocCommandBus, DocCommandEffectRegistry, DocQueryRegistry } from '@searsuite/sear-assembly-commands';
import {
  ConfigEngine,
  defaultDocConfig,
  type DocConfig,
  type EditorDefaultConfigOverrides,
} from '@searsuite/sear-assembly-config';
import { DocInputPlugin, DocRuntimeExtensionRegistry } from '@searsuite/sear-assembly-doc';
import { PipelineStepExecutorRegistry, PluginManager, SessionStateRegistry } from '@searsuite/sear-assembly-plugin';
import {
  DocNodeRegistry,
  RichTextBlockFlowRegistry,
  RichTextInlineStyleRegistry,
  RichTextLineBoxRegistry,
} from '@searsuite/sear-domain-doc';
import { DocLayoutEngine } from '@searsuite/sear-domain-editor';
import { type Container, Scope } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';
import { ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { DocDocumentSessionCoordinator } from './DocDocumentSessionCoordinator';
import { DocKernel } from './DocKernel';
import { type DocRuntimeAdapters } from './DocKernelContracts';

/** Registers only document business services; presentation is never a prerequisite. */
export function registerDocKernelServices(
  container: Container,
  adapters: DocRuntimeAdapters,
  overrides?: EditorDefaultConfigOverrides<DocConfig>,
): void {
  container.register(Platform.symbol, adapters.platform, Scope.Singleton);
  const config = new ConfigEngine(defaultDocConfig, overrides);
  container.registerInstance(ConfigEngine.symbol, config);
  container.registerFactory(
    PluginManager.symbol,
    () => new PluginManager(container.resolve(Platform.symbol)),
    Scope.Singleton,
  );
  container.register(PipelineStepExecutorRegistry.symbol, PipelineStepExecutorRegistry, Scope.Singleton);
  container.register(ObservationRegistry.symbol, ObservationRegistry, Scope.Singleton);
  container.register(SessionStateRegistry.symbol, SessionStateRegistry, Scope.Singleton);
  container.register(DocRuntimeExtensionRegistry.symbol, DocRuntimeExtensionRegistry, Scope.Singleton);
  container.register(DocNodeRegistry.symbol, DocNodeRegistry, Scope.Singleton);
  container.register(RichTextInlineStyleRegistry.symbol, RichTextInlineStyleRegistry, Scope.Singleton);
  container.register(RichTextLineBoxRegistry.symbol, RichTextLineBoxRegistry, Scope.Singleton);
  container.registerFactory(
    RichTextBlockFlowRegistry.symbol,
    () => new RichTextBlockFlowRegistry(config.getDefaultConfig().docParagraphSpacingAfter),
    Scope.Singleton,
  );
  container.register(DocLayoutEngine.symbol, DocLayoutEngine, Scope.Singleton);
  container.register(DocInputPlugin.symbol, DocInputPlugin, Scope.Singleton);
  container.register(DocCommandBus.symbol, DocCommandBus, Scope.Singleton);
  container.register(DocQueryRegistry.symbol, DocQueryRegistry, Scope.Singleton);
  container.register(DocCommandEffectRegistry.symbol, DocCommandEffectRegistry, Scope.Singleton);
  container.register(DocDocumentSessionCoordinator.symbol, DocDocumentSessionCoordinator, Scope.Singleton);
  container.registerFactory(
    DocKernel.symbol,
    () =>
      new DocKernel(
        container.resolve(PluginManager.symbol),
        container.resolve(PipelineStepExecutorRegistry.symbol),
        config,
        container.resolve(Platform.symbol),
      ),
    Scope.Singleton,
  );
}
