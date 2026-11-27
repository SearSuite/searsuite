import { type SheetEditor } from '@searsuite/sear-assembly-commands';
import { type SheetDocumentState, type SheetSessionState } from '@searsuite/sear-assembly-sheet-state';
import { type SheetViewImplementation } from './SheetViewContracts';
import { type FileDownload } from '@searsuite/sear-foundation-platform';

import { type Container } from '@searsuite/sear-foundation-di';
import { type Platform, WebServiceClient, XmlDocumentParser, XmlXPathEngine, XmlXPathEvaluator } from '@searsuite/sear-foundation-platform';
import { type UserInteractionService } from '@searsuite/sear-foundation-user-interaction';

import { type CollabTransport } from '@searsuite/sear-plugin-collab';

import { type SearFormulaBar, type SearToolbar } from '@searsuite/sear-assembly-plugin';
import { type SheetClipboard } from '@searsuite/sear-plugin-clipboard';
import { type RenderContext } from '@searsuite/sear-render-context';
import { type TextShaper } from '@searsuite/sear-render-metrics';
import { type SheetEmbeddedEditor } from '@searsuite/sear-sheet-editor-contract';
import { type CursorEngine } from '@searsuite/sear-render-cursor';
import { type EventRegistrar } from '@searsuite/sear-render-event-engine';
import { type KeyboardRouter, type PointerCapture, type TextInput } from '@searsuite/sear-render-input';
import { type Scroller, type ScrollPublisher } from '@searsuite/sear-render-scroll';
import { type SheetPlugin, type SheetPluginImplementation } from '@searsuite/sear-assembly-commands';

import { type IFunctionRegistry } from '@searsuite/sear-domain-formula-engine';

/** Constructor contract for DI-registered adapter implementations. */
export type InjectableImplementation<T> = new (...args: never[]) => T;

/** Platform-specific services required to assemble the default sheet editor. */
export interface SheetEditorAdapters {
  platform: InjectableImplementation<Platform>;
  createRenderContexts(): {
    renderContext: RenderContext;
    offScreenRenderContext: RenderContext;
    hitRenderContext: RenderContext;
  };
  /** Creates an editor-local text shaper; omission uses render-context measurements. */
  createTextShaper?(renderContext: RenderContext): TextShaper;
  scroller: InjectableImplementation<Scroller & { getPublisher(): ScrollPublisher }>;
  eventRegistrar: InjectableImplementation<EventRegistrar>;
  textInput: InjectableImplementation<TextInput>;
  keyboardRouter: InjectableImplementation<KeyboardRouter>;
  pointerCapture: InjectableImplementation<PointerCapture>;
  cursorEngine: InjectableImplementation<CursorEngine>;
  collabTransport: InjectableImplementation<CollabTransport>;
  toolbar: InjectableImplementation<SearToolbar>;
  /** Optional formula input surface supplied by the host. */
  formulaBar?: InjectableImplementation<SearFormulaBar>;
  /** Optional host file-save capability; existing environment bindings take precedence. The editor owns newly created adapters. */
  fileDownload?: InjectableImplementation<FileDownload>;
  /** Host-owned service for decisions that require a user response. */
  userInteraction?: InjectableImplementation<UserInteractionService>;
  /** Host XML parser paired with the XPath engine; defaults to the browser implementation. */
  xmlDocumentParser?: InjectableImplementation<XmlDocumentParser>;
  /** Host XPath engine paired with the XML parser; defaults to the browser implementation. */
  xmlXPathEngine?: InjectableImplementation<XmlXPathEngine>;
  /** Optional complete XML/XPath override used by XML-backed formula plugins. */
  xmlXPathEvaluator?: InjectableImplementation<XmlXPathEvaluator>;
  /** Asynchronous web-service transport used by host-managed formula caches. */
  webServiceClient?: InjectableImplementation<WebServiceClient>;
  /** Creates the function catalog owned by this editor or its parent workbook. */
  createFunctionRegistry?(): IFunctionRegistry;
  clipboard?: InjectableImplementation<SheetClipboard>;
  registerEnvironment?(container: Container): void;
}

/**
 * Inputs used to assemble one Sheet editor instance.
 *
 * `sheetState` supplies the initial document; `adapters` supplies the host
 * services and render contexts. Optional plugins extend the default feature
 * set, while `sessionState` restores editor-local values after a remount.
 */
export interface SheetEditorConfiguration {
  viewport?: { width: number; height: number };
  adapters: SheetEditorAdapters;
  sheetState: SheetDocumentState;
  /** Default font size used by ordinary Sheet cells. */
  cellFontSize?: number;
  /** Default font family and fallback list used by ordinary Sheet cells. */
  cellFontFamily?: string;
  /** Optional editor used to render and edit rich text embedded in Sheet cells. */
  embeddedEditor?: SheetEmbeddedEditor;
  /** Optional editor-local state restored when remounting a workbook sheet. */
  sessionState?: SheetSessionState;
  onCreated?(editor: SheetEditor): void;
  plugins?: readonly SheetPluginImplementation<SheetPlugin<unknown>>[];
  /** Input, drawing and host UI extensions. */
  viewExtensions?: readonly SheetViewImplementation[];
}
