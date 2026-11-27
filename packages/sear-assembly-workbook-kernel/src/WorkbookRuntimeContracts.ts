import { type SheetEditor } from '@searsuite/sear-assembly-commands';
import { type SheetRuntimeAdapters, type SheetKernelConfiguration } from '@searsuite/sear-assembly-sheet-kernel';
import { type SheetDocumentState, type SheetSessionState } from '@searsuite/sear-assembly-sheet-state';
import { type SheetPlugin, type SheetPluginImplementation } from '@searsuite/sear-assembly-commands';
import { type WorkbookDocumentState, type WorkbookSheetId } from '@searsuite/sear-domain-workbook';
import { type ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { type WorkbookCommandBus } from './WorkbookCommandBus';
import { type WorkbookDocumentApi } from './WorkbookDocumentApi';
import { type WorkbookRuntimeCapabilityReader } from './WorkbookRuntimeExtensionRegistry';
import { type WorkbookSessionState } from './WorkbookSessionState';
import { type WorkbookSheetsApi } from './WorkbookSheetsApi';
import { type WorkbookPluginImplementation } from './WorkbookPluginContracts';

/** Input passed when the workbook assembly creates one active SheetEditor. */
export interface WorkbookSheetClientFactoryInput {
  readonly sheetId: WorkbookSheetId;
  readonly configuration: SheetKernelConfiguration;
}

export type WorkbookSheetClientFactory = (input: WorkbookSheetClientFactoryInput) => SheetEditor;

/** Read-only active SheetEditor capture hook used by custom hosts and focused tests. */
export interface WorkbookSheetStateCaptureInput {
  readonly sheetId: WorkbookSheetId;
  readonly editor: SheetEditor;
  readonly sheetState: SheetDocumentState;
  readonly documentState: WorkbookDocumentState<SheetDocumentState>;
}

export type WorkbookSheetStateCapture = (input: WorkbookSheetStateCaptureInput) => SheetDocumentState;

/** Read-only active SheetEditor session capture hook. */
export interface WorkbookSheetSessionStateCaptureInput {
  readonly sheetId: WorkbookSheetId;
  readonly editor: SheetEditor;
  readonly sessionState: SheetSessionState | undefined;
}

export type WorkbookSheetSessionStateCapture = (
  input: WorkbookSheetSessionStateCaptureInput,
) => SheetSessionState | undefined;

/** Public configuration accepted by createWorkbookEditor(). */
export interface WorkbookRuntimeConfiguration {
  readonly documentState: WorkbookDocumentState<SheetDocumentState>;
  readonly sessionState?: WorkbookSessionState;
  readonly adapters: SheetRuntimeAdapters;
  readonly plugins?: readonly WorkbookPluginImplementation[];
  readonly sheetPlugins?: readonly SheetPluginImplementation<SheetPlugin<unknown>>[];
  readonly sheetClientFactory?: WorkbookSheetClientFactory;
  readonly captureSheetState?: WorkbookSheetStateCapture;
  readonly captureSheetSessionState?: WorkbookSheetSessionStateCapture;
  readonly warn?: (message: string, ...details: unknown[]) => void;
  /** One-time assembly callback for registering host-owned commands. */
  readonly onCreated?: (editor: WorkbookEditor) => void;
}

/** Public workbook facade returned by createWorkbookEditor(). */
export interface WorkbookEditor {
  /** The supported command entry point for workbook user and program actions. */
  readonly commands: WorkbookCommandBus;
  /** Typed editor-local state and event observations exposed to the host. */
  readonly observations: ObservationRegistry;
  /** Read-only access to typed services owned by this editor's isolated runtime. */
  readonly services: WorkbookRuntimeCapabilityReader;
  /** Read-only access to document-owned workbook state. */
  readonly document: WorkbookDocumentApi;
  /** Read-only access to the active and mounted SheetEditor. */
  readonly sheets: WorkbookSheetsApi;
  /** Releases the active SheetEditor, plugins, observations, commands, and editor-local services. */
  destroy(): void;
}
