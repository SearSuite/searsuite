import {
  type Platform,
  type FileDownload,
  type WebServiceClient,
  type XmlDocumentParser,
  type XmlXPathEngine,
  type XmlXPathEvaluator,
} from '@searsuite/sear-foundation-platform';
import { type UserInteractionService } from '@searsuite/sear-foundation-user-interaction';
import { type Container } from '@searsuite/sear-foundation-di';
import { type IFunctionRegistry } from '@searsuite/sear-domain-formula-engine';
import { type CollabTransport } from '@searsuite/sear-plugin-collab';
import { type SheetClipboard } from '@searsuite/sear-plugin-clipboard';
import { type SheetPlugin, type SheetPluginImplementation, type SheetEditor } from '@searsuite/sear-assembly-commands';
import { type SheetDocumentState, type SheetSessionState } from '@searsuite/sear-assembly-sheet-state';

/** Constructor registered in an editor-local service container. */
export type RuntimeServiceImplementation<Service> = new (...args: never[]) => Service;

/** Host services required by the Sheet business runtime. */
export interface SheetRuntimeAdapters {
  readonly platform: RuntimeServiceImplementation<Platform>;
  readonly collabTransport: RuntimeServiceImplementation<CollabTransport>;
  readonly clipboard?: RuntimeServiceImplementation<SheetClipboard>;
  readonly fileDownload?: RuntimeServiceImplementation<FileDownload>;
  readonly userInteraction?: RuntimeServiceImplementation<UserInteractionService>;
  readonly xmlDocumentParser?: RuntimeServiceImplementation<XmlDocumentParser>;
  readonly xmlXPathEngine?: RuntimeServiceImplementation<XmlXPathEngine>;
  readonly xmlXPathEvaluator?: RuntimeServiceImplementation<XmlXPathEvaluator>;
  readonly webServiceClient?: RuntimeServiceImplementation<WebServiceClient>;
  createFunctionRegistry?(): IFunctionRegistry;
  registerEnvironment?(container: Container): void;
}

/** Inputs for a business-only Sheet editor. */
export interface SheetKernelConfiguration {
  readonly adapters: SheetRuntimeAdapters;
  readonly sheetState: SheetDocumentState;
  readonly sessionState?: SheetSessionState;
  readonly cellFontSize?: number;
  readonly cellFontFamily?: string;
  readonly plugins?: readonly SheetPluginImplementation<SheetPlugin<unknown>>[];
  onCreated?(editor: SheetEditor): void;
}
