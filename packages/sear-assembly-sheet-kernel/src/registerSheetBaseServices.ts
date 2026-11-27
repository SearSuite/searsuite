import {
  ConfigEngine,
  defaultSheetConfig,
  type EditorDefaultConfigOverrides,
  type SheetConfig,
} from '@searsuite/sear-assembly-config';
import {
  SessionStateRegistry,
  SheetClipboardTransferRegistry,
  SheetFormatTransferRegistry,
} from '@searsuite/sear-assembly-plugin';
import {
  PipelineStepExecutorRegistry,
  SheetInteractionReducerRegistry,
  SheetInteractionStore,
} from '@searsuite/sear-assembly-plugin';
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

import { SubscriptionManager } from '@searsuite/sear-foundation-subscription';
import { SheetDisplayedValueChanges } from '@searsuite/sear-domain-cell-types';
import { DataEngine } from '@searsuite/sear-domain-state';
import { SheetDataEngine } from '@searsuite/sear-domain-sheet';
import { type SheetRuntimeAdapters } from './SheetKernelContracts';
import { SheetKernel } from './SheetKernel';
import { SheetOwnerLifecycle } from './SheetOwnerLifecycle';
import { SheetFormulaPriority } from './SheetFormulaPriority';
/** Registers platform and business state services without allocating presentation resources. */
export function registerSheetBaseServices(
  container: Container,
  adapters: Pick<
    SheetRuntimeAdapters,
    'platform' | 'xmlDocumentParser' | 'xmlXPathEngine' | 'xmlXPathEvaluator' | 'webServiceClient'
  >,
  defaultConfigOverrides: EditorDefaultConfigOverrides<SheetConfig> = {},
) {
  container.register(Platform.symbol, adapters.platform, Scope.Singleton);
  container.registerFactory(
    SheetDisplayedValueChanges.symbol,
    () =>
      new SheetDisplayedValueChanges((error) =>
        container.resolve<Platform>(Platform.symbol).warn('Sheet displayed-value change listener failed.', error),
      ),
    Scope.Singleton,
  );
  container.register(
    XmlDocumentParser.symbol,
    adapters.xmlDocumentParser ?? UnavailableXmlDocumentParser,
    Scope.Singleton,
  );
  container.register(XmlXPathEngine.symbol, adapters.xmlXPathEngine ?? UnavailableXmlXPathEngine, Scope.Singleton);
  if (adapters.xmlXPathEvaluator) {
    container.register(XmlXPathEvaluator.symbol, adapters.xmlXPathEvaluator, Scope.Singleton);
  } else {
    container.registerFactory(
      XmlXPathEvaluator.symbol,
      () =>
        new XmlXPathEvaluator(
          container.resolve<XmlDocumentParser>(XmlDocumentParser.symbol),
          container.resolve<XmlXPathEngine>(XmlXPathEngine.symbol),
        ),
      Scope.Singleton,
    );
  }
  container.register(
    WebServiceClient.symbol,
    adapters.webServiceClient ?? UnavailableWebServiceClient,
    Scope.Singleton,
  );
  container.register(SubscriptionManager.symbol, SubscriptionManager, Scope.Prototype);
  container.register(SessionStateRegistry.symbol, SessionStateRegistry, Scope.Singleton);
  container.registerInstance(SheetFormatTransferRegistry.symbol, new SheetFormatTransferRegistry());
  container.registerInstance(SheetClipboardTransferRegistry.symbol, new SheetClipboardTransferRegistry());
  container.register(SheetInteractionStore.symbol, SheetInteractionStore, Scope.Singleton);
  container.register(SheetInteractionReducerRegistry.symbol, SheetInteractionReducerRegistry, Scope.Singleton);
  container.register(PipelineStepExecutorRegistry.symbol, PipelineStepExecutorRegistry, Scope.Singleton);
  const dataEngine = new SheetDataEngine();
  container.registerInstance(DataEngine.symbol, dataEngine);
  const configEngine = new ConfigEngine(defaultSheetConfig, defaultConfigOverrides);
  container.registerInstance(ConfigEngine.symbol, configEngine);
  container.register(SheetOwnerLifecycle.symbol, SheetOwnerLifecycle, Scope.Singleton);
  container.register(SheetFormulaPriority.symbol, SheetFormulaPriority, Scope.Singleton);
  container.register(SheetKernel.symbol, SheetKernel, Scope.Singleton);
  return { configEngine, dataEngine };
}
