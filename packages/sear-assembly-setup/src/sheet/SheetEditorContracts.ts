import { type FileDownload } from '@searsuite/sear-foundation-platform';
import { SheetCommandBus, SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { SheetMatrix } from '@searsuite/sear-assembly-core';
import { AlignmentMatrix, VerticalAlignmentMatrix } from '@searsuite/sear-plugin-alignment';
import { CellFillMatrix } from '@searsuite/sear-plugin-cell-fill';
import { CellHighlightMatrix } from '@searsuite/sear-plugin-cell-highlight';
import { DataValidationMatrix } from '@searsuite/sear-plugin-data-validation';
import { SheetFilterMatrix } from '@searsuite/sear-plugin-filter';
import { type CellBorderMatrix } from '@searsuite/sear-plugin-cell-border';
import { DuplicateMatrix } from '@searsuite/sear-plugin-duplicate';
import { CellFormatMatrix } from '@searsuite/sear-plugin-cell-format';
import { FixedRowMatrix } from '@searsuite/sear-plugin-fixed-row';
import { SheetFreezeMatrix } from '@searsuite/sear-plugin-freeze';
import { CSRMatrix, ColumnShapeDimensionsCSRMatrix, RowShapeDimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import { type Container } from '@searsuite/sear-foundation-di';
import { type Platform, WebServiceClient, XmlDocumentParser, XmlXPathEngine, XmlXPathEvaluator } from '@searsuite/sear-foundation-platform';
import { type UserInteractionService } from '@searsuite/sear-foundation-user-interaction';
import { type CellMergeMatrix } from '@searsuite/sear-plugin-cell-merge';
import { type ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { type CollabTransport } from '@searsuite/sear-plugin-collab';
import { type SessionStateSnapshot } from '@searsuite/sear-assembly-plugin';
import { type SearFormulaBar, type SearToolbar } from '@searsuite/sear-assembly-plugin';
import { type SheetClipboard } from '@searsuite/sear-plugin-clipboard';
import { type RenderContext } from '@searsuite/sear-render-context';
import { type TextShaper } from '@searsuite/sear-render-metrics';
import { type SheetEmbeddedEditor } from '@searsuite/sear-sheet-editor-contract';
import { type CursorEngine } from '@searsuite/sear-render-cursor';
import { type EventRegistrar } from '@searsuite/sear-render-event-engine';
import { type KeyboardRouter, type PointerCapture, type TextInput } from '@searsuite/sear-render-input';
import { type Scroller, type ScrollPublisher } from '@searsuite/sear-render-scroll';
import { type SheetPlugin, type SheetPluginImplementation } from './SheetPluginContracts';
import { type SheetRuntimeCapabilityReader } from './SheetRuntimeExtensionRegistry';
import { type IFunctionRegistry } from '@searsuite/sear-domain-formula-engine';

type SheetEditorPlugin = SheetPlugin<unknown>;
type SheetEditorPluginImplementation = SheetPluginImplementation<SheetEditorPlugin>;

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
  plugins?: SheetEditorPluginImplementation[];
}

/** Document data owned by one sheet and eligible for future ExportPlugin serialization. */
export interface SheetDocumentState {
  sheetData: SheetMatrix;
  rowSizes: RowShapeDimensionsCSRMatrix;
  columnSizes: ColumnShapeDimensionsCSRMatrix;
  cellAlignments: AlignmentMatrix;
  /** Sparse vertical cell alignment state. */
  cellVerticalAlignments: VerticalAlignmentMatrix;
  /** Sparse cell fill state. */
  cellFills: CellFillMatrix;
  /** Sparse conditional highlight rules anchored at their range starts. */
  cellHighlights: CellHighlightMatrix;
  /** Sparse data validation rules anchored at range starts. */
  dataValidations?: DataValidationMatrix;
  /** Sheet-owned filter range and column rules. */
  filters?: SheetFilterMatrix;
  /** Sparse custom cell-edge state; absence initializes an empty border owner. */
  cellBorders?: CellBorderMatrix;
  /** Sparse duplicate-item highlight state. */
  duplicates: DuplicateMatrix;
  /** Sparse per-cell number-format state. */
  cellFormats: CellFormatMatrix;
  /** Sparse per-row fixed state. */
  fixedRows?: FixedRowMatrix;
  /** Persistent top and left freeze boundaries. */
  freeze?: SheetFreezeMatrix;
  rowHiddenOriginalSizes?: CSRMatrix<number>;
  columnHiddenOriginalSizes?: CSRMatrix<number>;
  cellMerges: CellMergeMatrix;
}

/** Opaque, in-memory contributor snapshot retained per sheet while a workbook editor is open. */
export type SheetSessionState = SessionStateSnapshot;

/**
 * Host-facing interface returned by `createSheetEditor`.
 *
 * Send changes through `commands`, read current values through `queries`, and
 * subscribe to updates through `observations`. `services` exposes typed
 * editor-owned dependencies. Call `destroy` when the host removes this editor
 * so its adapters and subscriptions are released.
 */
export interface SheetEditor {
  /** The sole supported entry point for user and program commands. */
  readonly commands: SheetCommandBus;
  /** Typed runtime query registry for side-effect-free editor reads. */
  readonly queries: SheetQueryRegistry;
  /** Typed editor-local state and event observations exposed to the host. */
  readonly observations: ObservationRegistry;
  /** Read-only access to typed services owned by this editor's isolated runtime. */
  readonly services: SheetRuntimeCapabilityReader;
  /** Releases runtime services and every active host observation subscription. */
  destroy(): void;
}

export type { SheetEditorPlugin, SheetEditorPluginImplementation };
