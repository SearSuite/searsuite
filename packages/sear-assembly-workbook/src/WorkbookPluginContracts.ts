import {
  hasPluginCommandRegistrar,
  hasPluginObservationRegistrar,
  hasPluginRuntimeCapabilityRegistrar,
  hasPluginSessionStateRegistrar,
  type PluginExtension,
  type SessionStateRegistry,
} from '@searsuite/sear-assembly-plugin';
import {
  type SheetDocumentState,
  type SheetPlugin,
  type SheetPluginImplementation,
} from '@searsuite/sear-assembly-setup';
import { type WorkbookSheetId } from '@searsuite/sear-domain-workbook';
import { SearError } from '@searsuite/sear-foundation-error';
import {
  type IFormulaExternalServiceProvider,
  type IFormulaTextServiceProvider,
  type IFunctionRegistry,
} from '@searsuite/sear-domain-formula-engine';
import { type WebServiceClient, type XmlXPathEvaluator } from '@searsuite/sear-foundation-platform';
import { type Container } from '@searsuite/sear-foundation-di';
import { type ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { type WorkbookCommandBus } from './WorkbookCommandBus';
import { type WorkbookCommandResult } from './WorkbookCommands';
import { type WorkbookTransaction, type WorkbookTransactionCommittedEvent } from './WorkbookTransaction';
import { type WorkbookRuntimeExtensionRegistry } from './WorkbookRuntimeExtensionRegistry';
import { type WorkbookDocumentApi } from './WorkbookDocumentApi';
import { type WorkbookSheetsApi } from './WorkbookSheetsApi';
import { type ActivateWorkbookSheetCommandInput } from './WorkbookCommands';

/** Resource disposer returned by Workbook plugin lifecycle hooks. */
export type WorkbookPluginDisposer = () => void;

/** Runtime services exposed to Workbook plugins for one WorkbookEditor instance. */
export interface WorkbookPluginRuntime {
  readonly commands: WorkbookCommandBus;
  readonly observations: ObservationRegistry;
  readonly session: SessionStateRegistry;
  readonly extensions: WorkbookRuntimeExtensionRegistry;
  readonly document: WorkbookDocumentApi;
  readonly sheets: WorkbookSheetsApi;
  readonly formula: {
    /** Workbook-owned registry shared with every mounted Sheet editor. */
    readonly functions: IFunctionRegistry;
    readonly textServices: IFormulaTextServiceProvider;
    readonly externalServices: IFormulaExternalServiceProvider;
    readonly xmlXPath: XmlXPathEvaluator;
    readonly webService: WebServiceClient;
  };
  /** Commits a transaction assembled inside a typed Workbook command. */
  executeTransaction(transaction: WorkbookTransaction): WorkbookCommandResult;
  /** Returns the current result shape for a command that performs no mutation. */
  createCommandResult(activeSheetEditorChanged: boolean): WorkbookCommandResult;
}

/** Context passed to Workbook plugin lifecycle hooks. */
export interface WorkbookPluginContext {
  readonly container: Container;
  readonly runtime: WorkbookPluginRuntime;
}

/** Context used when a Workbook plugin contributes plugins to a mounted SheetEditor. */
export interface WorkbookCompanionSheetPluginContext extends WorkbookPluginContext {
  readonly sheetId: WorkbookSheetId;
  readonly sheetState: SheetDocumentState;
}

/** One typed service value contributed to a temporary child SheetEditor container. */
export interface WorkbookCompanionSheetService<Value = unknown> {
  readonly token: symbol;
  readonly value: Value;
}

/** Services available before a Workbook plugin is registered in its editor-local container. */
export interface WorkbookPluginServiceContext {
  readonly container: Container;
}

/** Base contract for plugins owned by createWorkbookEditor(). */
export abstract class WorkbookPlugin
  implements
    PluginExtension<WorkbookCommandBus, ObservationRegistry, SessionStateRegistry, WorkbookRuntimeExtensionRegistry>
{
  #assertRuntimeWrite: (() => void) | undefined;

  /** Closes plugin-owned runtime mutations after Workbook assembly. */
  public enforceRuntimeWriteBoundary(assertWrite: () => void): void {
    if (this.#assertRuntimeWrite) throw new SearError('Workbook plugin runtime write boundary is already installed.');
    this.#assertRuntimeWrite = assertWrite;
    Object.defineProperty(this, 'assertRuntimeWriteAllowed', {
      value: WorkbookPlugin.prototype.assertRuntimeWriteAllowed,
      writable: false,
      configurable: false,
    });
  }

  /** Guards methods callable through a retained prototype reference. */
  protected assertRuntimeWriteAllowed(): void {
    this.#assertRuntimeWrite?.();
  }

  public static registerServices?(context: WorkbookPluginServiceContext): void;
  public registerCommands?(commands: WorkbookCommandBus): void;
  public registerObservations?(observations: ObservationRegistry): void;
  public registerSessionState?(registry: SessionStateRegistry): void;
  public registerCapabilities?(registry: WorkbookRuntimeExtensionRegistry): void;
  public getSheetPlugins?(
    context: WorkbookCompanionSheetPluginContext,
  ): readonly SheetPluginImplementation<SheetPlugin<unknown>>[];
  /** Contributes parent-owned services without exposing the child editor container. */
  public getSheetServices?(context: WorkbookCompanionSheetPluginContext): readonly WorkbookCompanionSheetService[];
  public initialize?(context: WorkbookPluginContext): void | WorkbookPluginDisposer;
  /** Runs inside the activation command before the source Sheet is captured. */
  public onBeforeSheetActivation?(input: ActivateWorkbookSheetCommandInput): void;
  /** Restores plugin-local work if activation fails before commit. */
  public onSheetActivationFailed?(input: ActivateWorkbookSheetCommandInput): void;
  public onTransactionCommitted?(event: WorkbookTransactionCommittedEvent): void;
  public onWorkbookDestroy?(context: WorkbookPluginContext): void;
}

/** Injectable Workbook plugin class accepted by createWorkbookEditor(). */
export interface WorkbookPluginImplementation<TPlugin extends WorkbookPlugin = WorkbookPlugin> {
  new (...args: never[]): TPlugin;
  readonly symbol: symbol;
  registerServices?(context: WorkbookPluginServiceContext): void;
}

/** Resolves isolated Workbook plugin singletons from one editor-local container. */
export function resolveWorkbookPlugins(
  container: Container,
  implementations: readonly WorkbookPluginImplementation[],
): WorkbookPlugin[] {
  return implementations.map((implementation) => container.resolve<WorkbookPlugin>(implementation.symbol));
}

export function registerWorkbookPluginCommands(plugins: readonly unknown[], commands: WorkbookCommandBus): void {
  plugins.forEach((plugin) => {
    if (hasPluginCommandRegistrar<WorkbookCommandBus>(plugin)) plugin.registerCommands(commands);
  });
}

export function registerWorkbookPluginObservations(
  plugins: readonly unknown[],
  observations: ObservationRegistry,
): void {
  plugins.forEach((plugin) => {
    if (hasPluginObservationRegistrar<ObservationRegistry>(plugin)) plugin.registerObservations(observations);
  });
}

export function registerWorkbookPluginSessionStates(plugins: readonly unknown[], session: SessionStateRegistry): void {
  plugins.forEach((plugin) => {
    if (hasPluginSessionStateRegistrar<SessionStateRegistry>(plugin)) plugin.registerSessionState(session);
  });
}

/** Publishes every typed runtime capability contributed by Workbook plugins. */
export function registerWorkbookPluginCapabilities(
  plugins: readonly unknown[],
  registry: WorkbookRuntimeExtensionRegistry,
): void {
  plugins.forEach((plugin) => {
    if (hasPluginRuntimeCapabilityRegistrar<WorkbookRuntimeExtensionRegistry>(plugin)) {
      plugin.registerCapabilities(registry);
    }
  });
}
