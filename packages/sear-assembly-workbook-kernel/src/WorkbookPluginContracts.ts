import {
  hasPluginCommandRegistrar,
  hasPluginObservationRegistrar,
  hasPluginRuntimeCapabilityRegistrar,
  hasPluginSessionStateRegistrar,
  type PluginExtension,
  type SessionStateRegistry,
} from '@searsuite/sear-assembly-plugin';
import { type SheetDocumentState } from '@searsuite/sear-assembly-sheet-state';
import { type SheetPlugin, type SheetPluginImplementation } from '@searsuite/sear-assembly-commands';
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
import { type WorkbookSheetClientsApi } from './WorkbookSheetClientsApi';
import { type ActivateWorkbookSheetCommandInput } from './WorkbookCommands';

/** Resource disposer returned by Workbook plugin lifecycle hooks. */
export type WorkbookPluginDisposer = () => void;

/** Runtime services exposed to Workbook plugins for one WorkbookEditor instance. */
export interface WorkbookPluginRuntime {
  /** The owning typed dispatcher through which state mutations are executed. */
  readonly commands: WorkbookCommandBus;
  /** Typed state and event subscriptions; listeners receive no mutation authority. */
  readonly observations: ObservationRegistry;
  /** Capture and restoration registry for detachable local state. */
  readonly session: SessionStateRegistry;
  /** Editor-local registry of typed capabilities, without global mutable registrations. */
  readonly extensions: WorkbookRuntimeExtensionRegistry;
  readonly document: WorkbookDocumentApi;
  readonly sheets: WorkbookSheetClientsApi;
  /** Formula functions, sources, results and external data capabilities. */
  readonly formula: {
    /** Workbook-owned registry shared with every mounted Sheet editor. */
    readonly functions: IFunctionRegistry;
    /** Metadata and cached external text services used by formula evaluation. */
    readonly textServices: IFormulaTextServiceProvider;
    /** Asynchronous external data services used by formula evaluation. */
    readonly externalServices: IFormulaExternalServiceProvider;
    /** Host-provided XML parsing and XPath evaluation capability. */
    readonly xmlXPath: XmlXPathEvaluator;
    /** Host-provided asynchronous web-service transport. */
    readonly webService: WebServiceClient;
  };
  /** Commits a transaction assembled inside a typed Workbook command. */
  executeTransaction(transaction: WorkbookTransaction): WorkbookCommandResult;
  /** Returns the current result shape for a command that performs no mutation. */
  createCommandResult(activeSheetEditorChanged: boolean): WorkbookCommandResult;
}

/** Context passed to Workbook plugin lifecycle hooks. */
export interface WorkbookPluginContext {
  /** Editor-local dependency container available only during composition. */
  readonly container: Container;
  /** Capabilities owned by the currently assembled editor instance. */
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
  /** Editor-local dependency container available only during composition. */
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

  /** Registers editor-local dependencies before this contribution is constructed. */
  public static registerServices?(context: WorkbookPluginServiceContext): void;
  /** Registers typed commands; subsequent mutations run through the owning command bus. */
  public registerCommands?(commands: WorkbookCommandBus): void;
  /** Registers state or event sources whose subscriptions are owned by this editor. */
  public registerObservations?(observations: ObservationRegistry): void;
  /** Registers detachable local session state separately from durable document content. */
  public registerSessionState?(registry: SessionStateRegistry): void;
  /** Publishes editor-local typed capabilities for other extensions. */
  public registerCapabilities?(registry: WorkbookRuntimeExtensionRegistry): void;
  public getSheetPlugins?(
    context: WorkbookCompanionSheetPluginContext,
  ): readonly SheetPluginImplementation<SheetPlugin<unknown>>[];
  /** Contributes parent-owned services without exposing the child editor container. */
  public getSheetServices?(context: WorkbookCompanionSheetPluginContext): readonly WorkbookCompanionSheetService[];
  /** Completes setup after command, query and observation registrations are available. */
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
  /** Dependency injection token for this editor-local implementation. */
  readonly symbol: symbol;
  /** Registers editor-local dependencies before this contribution is constructed. */
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
