import {
  type SheetCellStyleReader,
  type SheetCellStyleRegistry,
  type SheetCellStyleDefaults,
} from '@searsuite/sear-domain-cell-types';
import {
  hasPluginCommandRegistrar,
  hasPluginQueryRegistrar,
  hasPluginObservationRegistrar,
  hasPluginSessionStateRegistrar,
  hasPluginRuntimeCapabilityRegistrar,
} from '@searsuite/sear-assembly-plugin';
import {
  Plugin,
  type PluginExtension,
  type PluginManager,
  type SessionStateRegistry,
  type SheetRangeMoveRegistry,
  type SheetStructureMoveRegistry,
  type SheetFormatTransferRegistry,
  type SheetClipboardTransferRegistry,
} from '@searsuite/sear-assembly-plugin';
import { ConfigEngine } from '@searsuite/sear-assembly-config';
import { type CellTypeCatalog } from '@searsuite/sear-domain-cell';
import { type SheetDataEngine } from '@searsuite/sear-domain-sheet';
import {
  type IFunctionRegistry,
  type IFormulaTextServiceProvider,
  type IFormulaExternalServiceProvider,
  type IFormulaResultProvider,
  type IFormulaRichResultProvider,
  type IFormulaSourceProvider,
} from '@searsuite/sear-domain-formula-engine';
import { type Platform, type XmlXPathEvaluator, type WebServiceClient } from '@searsuite/sear-foundation-platform';
import { type Container } from '@searsuite/sear-foundation-di';
import { type ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import {
  type SheetInteractionStore,
  type SheetInteractionReducerRegistry,
  type PipelineStepExecutorRegistry,
} from '@searsuite/sear-assembly-plugin';
import { SheetCommandBus } from './SheetCommandBus';
import { SheetQueryRegistry } from './SheetQueryRegistry';
import { defineSheetRuntimeCapability, SheetRuntimeExtensionRegistry } from './SheetRuntimeExtensionRegistry';

/** Neutral registration contract; concrete provider ordering belongs to the selected implementation. */
export type SheetFormulaProviderRegistry<Provider> = Provider & {
  /** Registers an editor-local contribution and returns its owned disposer. */
  register(registration: {
    readonly provider: Provider /** Deterministic rule priority; later matching priorities override earlier values. */;
    readonly priority?: number;
  }): () => void;
};

/** State, command, query and service contracts available while an owner is configured. */
export interface SheetPluginSetupRuntime {
  /** Editor-local registry of typed capabilities, without global mutable registrations. */
  readonly extensions: SheetRuntimeExtensionRegistry;
  /** Host-provided timing, scheduling and diagnostic operations. */
  readonly platform: Platform;
  /** Editor-local defaults and configuration contributions. */
  readonly config: ConfigEngine;
  /** Typed state and event subscriptions; listeners receive no mutation authority. */
  readonly observations: ObservationRegistry;
  /** Read-only typed queries over the latest committed state. */
  readonly queries: SheetQueryRegistry;
  /** Capture and restoration registry for detachable local state. */
  readonly session: SessionStateRegistry;
  /** Business state owners registered in this editor instance. */
  readonly plugins: PluginManager;
  /** Sparse Sheet state and neutral data-field projections. */
  readonly data: SheetDataEngine;
  /** Semantic cell appearance shared by automation, filtering and views. */
  readonly styles: SheetCellStyleReader;
  /** Semantic cell types, validation, display text and clipboard behavior. */
  readonly cells: { readonly catalog: CellTypeCatalog };
  /** Formula functions, sources, results and external data capabilities. */
  readonly formula: {
    /** Editor-local formula function registry. */
    readonly functions: IFunctionRegistry;
    /** Metadata and cached external text services used by formula evaluation. */
    readonly textServices: IFormulaTextServiceProvider;
    /** Asynchronous external data services used by formula evaluation. */
    readonly externalServices: IFormulaExternalServiceProvider;
    /** Read-only calculated cell values supplied by registered providers. */
    readonly results: SheetFormulaProviderRegistry<IFormulaResultProvider>;
    /** Read-only rich or structured formula results. */
    readonly richResults: SheetFormulaProviderRegistry<IFormulaRichResultProvider>;
    /** Persisted formula-source projections used by editing and evaluation. */
    readonly sources: SheetFormulaProviderRegistry<IFormulaSourceProvider>;
    /** Host-provided XML parsing and XPath evaluation capability. */
    readonly xmlXPath: XmlXPathEvaluator;
    /** Host-provided asynchronous web-service transport. */
    readonly webService: WebServiceClient;
  };
  /** Local interaction state and its command-owned reducers. */
  readonly interaction: {
    /** The committed local interaction state store. */
    readonly store: SheetInteractionStore;
    /** Editor-local reducers for typed interaction actions. */
    readonly reducers: SheetInteractionReducerRegistry;
    /** Registered executors for staged command pipeline steps. */
    readonly pipelineSteps: PipelineStepExecutorRegistry;
  };
}

/** Neutral runtime available after the command dispatcher has been bound. */
export interface SheetPluginRuntime extends SheetPluginSetupRuntime {
  /** The owning typed dispatcher through which state mutations are executed. */
  readonly commands: SheetCommandBus;
}

export const SheetRuntimeCapability = {
  Platform: defineSheetRuntimeCapability<Platform>('sheet.runtime.platform'),
  Config: defineSheetRuntimeCapability<ConfigEngine>('sheet.runtime.config'),
  Commands: defineSheetRuntimeCapability<SheetCommandBus>('sheet.runtime.commands'),
  Queries: defineSheetRuntimeCapability<SheetQueryRegistry>('sheet.runtime.queries'),
  Observations: defineSheetRuntimeCapability<ObservationRegistry>('sheet.runtime.observations'),
  Session: defineSheetRuntimeCapability<SessionStateRegistry>('sheet.runtime.session'),
  Plugins: defineSheetRuntimeCapability<PluginManager>('sheet.runtime.plugins'),
  Data: defineSheetRuntimeCapability<SheetDataEngine>('sheet.runtime.data'),
  Styles: defineSheetRuntimeCapability<SheetCellStyleReader>('sheet.runtime.styles'),
  Cells: defineSheetRuntimeCapability<SheetPluginSetupRuntime['cells']>('sheet.runtime.cells'),
  Formula: defineSheetRuntimeCapability<SheetPluginSetupRuntime['formula']>('sheet.runtime.formula'),
  Interaction: defineSheetRuntimeCapability<SheetPluginSetupRuntime['interaction']>('sheet.runtime.interaction'),
} as const;

/** Service registration performed by a plugin's composition root. */
export interface SheetPluginServiceContext {
  /** Editor-local dependency container available only during composition. */ readonly container: Container;
}

/** Configuration context containing neutral services only. */
export interface SheetPluginSetupContext {
  /** Editor-local dependency container available only during composition. */
  readonly container: Container;
  /** Capabilities owned by the currently assembled editor instance. */
  readonly runtime: SheetPluginSetupRuntime;
}

/** Initialized context containing a bound dispatcher without exposing its executor. */
export interface SheetPluginRuntimeContext extends SheetPluginSetupContext {
  /** Capabilities owned by the currently assembled editor instance. */
  readonly runtime: SheetPluginRuntime;
}

/** Sheet business extension independent of Core, input adapters and presentation. */
export abstract class SheetPlugin<State>
  extends Plugin<State>
  implements
    PluginExtension<
      SheetCommandBus,
      ObservationRegistry,
      SessionStateRegistry,
      SheetRuntimeExtensionRegistry,
      SheetQueryRegistry
    >
{
  /** Registers editor-local dependencies before this contribution is constructed. */
  public static registerServices?(context: SheetPluginServiceContext): void;
  /** Contributes semantic cell styles without supplying drawing nodes or native input. */
  public registerCellStyles?(registry: SheetCellStyleRegistry, defaults: SheetCellStyleDefaults): void;
  /** Registers typed commands; subsequent mutations run through the owning command bus. */
  public registerCommands?(commands: SheetCommandBus): void;
  /** Registers read-only projections without granting mutation authority to callers. */
  public registerQueries?(queries: SheetQueryRegistry): void;
  /** Contributes atomic projections for cell-range moves. */
  public registerRangeMoves?(registry: SheetRangeMoveRegistry): void;
  /** Contributes projections for row and column structural changes. */
  public registerStructureMoves?(registry: SheetStructureMoveRegistry): void;
  /** Contributes feature-owned formatting to copy, clear and paste operations. */
  public registerFormatTransfers?(registry: SheetFormatTransferRegistry): void;
  /** Contributes feature-owned cell data to clipboard transfers. */
  public registerClipboardTransfers?(registry: SheetClipboardTransferRegistry): void;
  /** Registers state or event sources whose subscriptions are owned by this editor. */
  public registerObservations?(observations: ObservationRegistry): void;
  /** Registers detachable local session state separately from durable document content. */
  public registerSessionState?(registry: SessionStateRegistry): void;
  /** Publishes editor-local typed capabilities for other extensions. */
  public registerCapabilities?(registry: SheetRuntimeExtensionRegistry): void;
  /** Connects editor-local capabilities during assembly before startup. */
  public configure?(context: SheetPluginSetupContext): void;
  /** Completes setup after command, query and observation registrations are available. */
  public initialize?(context: SheetPluginRuntimeContext): void;
  /** Starts lifecycle-owned subscriptions after initialization succeeds. */
  public start?(context: SheetPluginRuntimeContext): void;
  /** Releases state-owner subscriptions during editor teardown. */
  public onEditorDestroy?(context: SheetPluginRuntimeContext): void;
}

/** Injectable state-plugin implementation selected by an assembly. */
export interface SheetPluginImplementation<TPlugin extends SheetPlugin<unknown>> {
  new (...args: never[]): TPlugin;
  /** Dependency injection token for this editor-local implementation. */
  readonly symbol: symbol;
  /** Registers editor-local dependencies before this contribution is constructed. */
  registerServices?(context: SheetPluginServiceContext): void;
}

export function registerSheetPluginCommands(plugins: readonly unknown[], commands: SheetCommandBus): void {
  plugins.forEach(function registerSheetPluginCommand(plugin) {
    if (hasPluginCommandRegistrar<SheetCommandBus>(plugin)) plugin.registerCommands(commands);
  });
}

export function registerSheetPluginQueries(plugins: readonly unknown[], queries: SheetQueryRegistry): void {
  plugins.forEach(function registerSheetPluginQuery(plugin) {
    if (hasPluginQueryRegistrar<SheetQueryRegistry>(plugin)) plugin.registerQueries(queries);
  });
}

export function registerSheetPluginObservations(plugins: readonly unknown[], observations: ObservationRegistry): void {
  plugins.forEach(function registerSheetPluginObservation(plugin) {
    if (hasPluginObservationRegistrar<ObservationRegistry>(plugin)) plugin.registerObservations(observations);
  });
}

export function registerSheetPluginSessionStates(plugins: readonly unknown[], registry: SessionStateRegistry): void {
  plugins.forEach(function registerSheetPluginSessionState(plugin) {
    if (hasPluginSessionStateRegistrar<SessionStateRegistry>(plugin)) plugin.registerSessionState(registry);
  });
}

export function registerSheetPluginCapabilities(
  plugins: readonly unknown[],
  registry: SheetRuntimeExtensionRegistry,
): void {
  plugins.forEach(function registerSheetPluginCapability(plugin) {
    if (hasPluginRuntimeCapabilityRegistrar<SheetRuntimeExtensionRegistry>(plugin)) {
      plugin.registerCapabilities(registry);
    }
  });
}
