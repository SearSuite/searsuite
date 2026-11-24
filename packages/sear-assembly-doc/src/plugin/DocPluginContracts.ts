import { DocCursorManager, DocInputPlugin, SearCoreDoc } from '@searsuite/sear-assembly-core';
import { DocCommandBus } from '@searsuite/sear-assembly-commands';
import { ConfigEngine } from '@searsuite/sear-assembly-config';
import {
  hasPluginCommandRegistrar,
  hasPluginObservationRegistrar,
  hasPluginRuntimeCapabilityRegistrar,
  hasPluginSessionStateRegistrar,
  Plugin,
  type PluginExtension,
  type PluginManager,
  type SessionStateRegistry,
} from '@searsuite/sear-assembly-plugin';
import {
  DocNodeRegistry,
  RichTextInlineStyleRegistry,
  RichTextLineBoxRegistry,
  RichTextBlockFlowRegistry,
  type RichTextInlineStyleContribution,
  type RichTextLineBoxContribution,
  type RichTextBlockFlowContribution,
} from '@searsuite/sear-domain-doc';
import { DocLayoutEngine, type DocBlockRenderDebugSnapshot } from '@searsuite/sear-domain-editor';
import { type Container } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';
import { RenderContext } from '@searsuite/sear-render-context';
import { EventEngine, EventRegistrar } from '@searsuite/sear-render-event-engine';
import { TextInput, KeyboardRouter, PointerCapture, type KeyboardRouterHandlers } from '@searsuite/sear-render-input';
import { TextShaper } from '@searsuite/sear-render-metrics';
import {
  RichTextRunRenderRegistry,
  type NodeProperties,
  type RichTextRunRenderContribution,
} from '@searsuite/sear-render-node';
import { ScrollManager } from '@searsuite/sear-render-scroll';
import { type ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { defineDocRuntimeCapability, DocRuntimeExtensionRegistry } from './DocRuntimeExtensionRegistry';
import { type DocInputBindingRegistryCapability } from './DocPluginRuntimeCapability';

/** Render phase reported by virtual document layout instrumentation. */
export type DocVirtualLayoutRenderPhase = 'initial' | 'realtime';

/** Timing summary reported by virtual document layout instrumentation. */
export interface DocVirtualLayoutTimingSummary {
  readonly documentModelMs: number;
  readonly viewportRangeMs: number;
  readonly materializeBlocksMs: number;
  readonly heightCorrectionMs: number;
  readonly snapshotCacheMs: number;
  readonly cursorSelectionMs: number;
  readonly virtualLayoutTotalMs: number;
  readonly renderPrepareMode?: 'full' | 'viewport';
  readonly renderPrepareMs?: number;
}

/** Public virtual layout summary exposed through the Doc layout-service capability. */
export interface DocVirtualLayoutSummary {
  readonly renderPhase?: DocVirtualLayoutRenderPhase;
  readonly initialLoadMs?: number;
  readonly model: 'reused' | 'rebuilt';
  readonly totalBlocks: number;
  readonly rangeStart: number;
  readonly rangeEnd: number;
  readonly cursorBlock: number | null;
  readonly materializedBlocks: number;
  readonly materializedIndexes: string;
  readonly cacheHits: number;
  readonly cacheMisses: number;
  readonly heightIndexUpdated: boolean;
  readonly documentHeight: number;
  readonly blockRender?: DocBlockRenderDebugSnapshot;
  readonly timings: DocVirtualLayoutTimingSummary;
}

/** Listener notified when the virtual layout summary changes. */
export type DocVirtualLayoutSummaryListener = (summary: DocVirtualLayoutSummary) => void;

/** Public layout-service surface exposed to Doc plugins and hosts. */
export interface DocRenderLayoutServiceCapability {
  reset(): void;
  getLatestVirtualLayoutSummary(): DocVirtualLayoutSummary | null;
  subscribeVirtualLayoutSummary(listener: DocVirtualLayoutSummaryListener): () => void;
}

/** Render-engine surface exposed to Doc plugins. */
export interface DocRenderEngineCapability {
  render(pluginKey?: unknown): void;
}

/** Stable host capabilities supplied to a DocPlugin after editor assembly. */
export interface DocPluginRuntime {
  /** Extension capability registry for third-party document plugins. */
  readonly extensions: DocRuntimeExtensionRegistry;
  /** Platform adapter for timers, resize observation, and diagnostics. */
  readonly platform: Platform;
  /** Command bus exposed by the document editor instance. */
  readonly commands: DocCommandBus;
  /** Typed state and event observations owned by this editor instance. */
  readonly observations: ObservationRegistry;
  /** Local remount state contributed by built-in and third-party plugins. */
  readonly session: SessionStateRegistry;
  /** Ordered document plugin registry for this editor. */
  readonly plugins: PluginManager<SearCoreDoc, NodeProperties>;
  /** Text shaper used by document layout and rendering. */
  readonly textShaper: TextShaper;
  /** Document render services and visible context. */
  readonly render: {
    /** Render engine that schedules full or partial document redraws. */
    readonly engine: DocRenderEngineCapability;
    /** Visible render context selected by the host. */
    readonly context: RenderContext;
  };
  /** Event and hit-test services used by document interactions. */
  readonly events: {
    /** Event engine that dispatches normalized host events with hit targets. */
    readonly engine: EventEngine<NodeProperties>;
    /** Event registrar selected by the host adapter. */
    readonly registrar: EventRegistrar;
  };
  /** Host input adapters used by document editing commands. */
  readonly input: {
    /** Text input adapter for printable text, paste/cut, and IME composition. */
    readonly text: TextInput;
    /** Keyboard router for action keys. */
    readonly keyboard: KeyboardRouter;
    /** Host-wide pointer capture adapter using render-root view coordinates. */
    readonly pointer: PointerCapture;
  };
  /** Scroll state shared by document layout and rendering. */
  readonly scroll: {
    /** Scroll manager for the visible document viewport. */
    readonly manager: ScrollManager;
  };
  /** Rich-document domain services. */
  readonly document: {
    /** Core document runtime. */
    readonly core: SearCoreDoc;
    /** Node registry for schema-owned rich document nodes. */
    readonly nodes: DocNodeRegistry;
    /** Layout engine used by cursor, selection, pagination, and rendering. */
    readonly layout: DocLayoutEngine;
    /** Cursor, selection, IME composition, and caret render state. */
    readonly cursor: DocCursorManager;
    /** Plugin-owned inline text style readers and mutation policies. */
    readonly inlineStyles: RichTextInlineStyleRegistry;
    /** Plugin-owned line box resolver contributions. */
    readonly lineBoxes: RichTextLineBoxRegistry;
    /** Plugin-owned block flow resolver contributions. */
    readonly blockFlows: RichTextBlockFlowRegistry;
    /** Default input plugin that applies rich-document editing operations. */
    readonly input: DocInputPlugin;
  };
}

/** Document runtime capabilities registered by the default assembly root. */
export const DocRuntimeCapability = {
  Platform: defineDocRuntimeCapability<Platform>('doc.runtime.platform'),
  Config: defineDocRuntimeCapability<ConfigEngine>('doc.runtime.config'),
  Commands: defineDocRuntimeCapability<DocCommandBus>('doc.runtime.commands'),
  Observations: defineDocRuntimeCapability<ObservationRegistry>('doc.runtime.observations'),
  Session: defineDocRuntimeCapability<SessionStateRegistry>('doc.runtime.session'),
  Plugins: defineDocRuntimeCapability<PluginManager<SearCoreDoc, NodeProperties>>('doc.runtime.plugins'),
  TextShaper: defineDocRuntimeCapability<TextShaper>('doc.runtime.textShaper'),
  Render: defineDocRuntimeCapability<DocPluginRuntime['render']>('doc.runtime.render'),
  Events: defineDocRuntimeCapability<DocPluginRuntime['events']>('doc.runtime.events'),
  Input: defineDocRuntimeCapability<DocPluginRuntime['input']>('doc.runtime.input'),
  Scroll: defineDocRuntimeCapability<DocPluginRuntime['scroll']>('doc.runtime.scroll'),
  Document: defineDocRuntimeCapability<DocPluginRuntime['document']>('doc.runtime.document'),
  InlineStyles: defineDocRuntimeCapability<RichTextInlineStyleRegistry>('doc.runtime.inlineStyles'),
  LineBoxes: defineDocRuntimeCapability<RichTextLineBoxRegistry>('doc.runtime.lineBoxes'),
  BlockFlows: defineDocRuntimeCapability<RichTextBlockFlowRegistry>('doc.runtime.blockFlows'),
  LayoutService: defineDocRuntimeCapability<DocRenderLayoutServiceCapability>('doc.runtime.layoutService'),
} as const;

/** Services available while createDocEditor() registers document plugins. */
export interface DocPluginServiceContext {
  /** DI container used by the document assembly root. */
  readonly container: Container;
}

/** Typed public services available before createDocEditor() starts Core. */
export interface DocPluginSetupContext {
  /** DI container used by the document assembly root. */
  readonly container: Container;
  /** Runtime services available to document plugins. */
  readonly runtime: DocPluginRuntime;
}

/** Services available while a Doc plugin registers keyboard bindings. */
export interface DocKeyboardHandlerRegistrationContext {
  /** Aggregates plugin-owned keyboard handlers for the host adapter. */
  readonly bindings: DocInputBindingRegistryCapability;
  /** Executes semantic editor commands from keyboard handlers. */
  readonly commands: DocCommandBus;
}

/** Document setup capabilities plus the Core created by createDocEditor(). */
export interface DocPluginRuntimeContext extends DocPluginSetupContext {
  /** Core document runtime. */
  readonly core: SearCoreDoc;
}

/** Convenience base class for a Plugin targeting createDocEditor(). */
export abstract class DocPlugin<StateType>
  extends Plugin<SearCoreDoc, NodeProperties, StateType>
  implements PluginExtension<DocCommandBus, ObservationRegistry, SessionStateRegistry, DocRuntimeExtensionRegistry>
{
  /** Registers bindings required before this Doc plugin is instantiated. */
  public static registerServices?(context: DocPluginServiceContext): void;

  /** Registers every stable command id owned by this document plugin. */
  public registerCommands?(commands: DocCommandBus): void;

  /** Registers keyboard-to-command bindings owned by this document plugin. */
  public registerKeyboardHandlers?(context: DocKeyboardHandlerRegistrationContext): void;

  /** Registers typed state and event observations owned by this document plugin. */
  public registerObservations?(observations: ObservationRegistry): void;

  /** Registers plugin-owned inline text style readers and mutation policies. */
  public registerInlineStyles?(registry: RichTextInlineStyleRegistry): void;

  /** Registers plugin-owned render behavior for styled text runs. */
  public registerInlineStyleRenderers?(registry: RichTextRunRenderRegistry): void;

  /** Registers plugin-owned rich-text line box resolvers. */
  public registerLineBoxes?(registry: RichTextLineBoxRegistry): void;

  /** Registers plugin-owned top-level block flow resolvers. */
  public registerBlockFlows?(registry: RichTextBlockFlowRegistry): void;

  /** Registers local state that must survive an in-memory editor remount. */
  public registerSessionState?(registry: SessionStateRegistry): void;

  /** Publishes typed runtime services owned by this document plugin. */
  public registerCapabilities?(registry: DocRuntimeExtensionRegistry): void;

  /** Configures the document editor before runtime start. */
  public configure?(context: DocPluginSetupContext): void;

  /** Prepares behavior that requires initialized Core state but must run before runtime effects. */
  public initialize?(context: DocPluginRuntimeContext): void;

  /** Starts runtime behavior after the first document frame. */
  public start?(context: DocPluginRuntimeContext): void;

  /** Releases resources owned by this plugin before the Core is destroyed. */
  public onEditorDestroy?(context: DocPluginRuntimeContext): void;
}

/** Injectable DocPlugin class accepted by createDocEditor(). */
export interface DocPluginImplementation<TPlugin extends DocPlugin<unknown>> {
  new (...args: never[]): TPlugin;
  readonly symbol: symbol;
  registerServices?(context: DocPluginServiceContext): void;
}

/** Runs the register document plugin commands helper. */
export function registerDocPluginCommands(plugins: readonly unknown[], commands: DocCommandBus): () => void {
  const unregisterCommands: Array<() => void> = [];
  const registrarCommands = createDocCommandRegistrationRecorder(commands, unregisterCommands);
  try {
    plugins.forEach(function registerDocPluginCommand(plugin) {
      if (hasPluginCommandRegistrar<DocCommandBus>(plugin)) plugin.registerCommands(registrarCommands);
    });
  } catch (error) {
    unregisterRecordedDocCommands(unregisterCommands);
    throw error;
  }
  return function unregisterDocPluginCommands(): void {
    unregisterRecordedDocCommands(unregisterCommands);
  };
}

/** Registers every keyboard binding contributed by document plugins. */
export function registerDocPluginKeyboardHandlers(
  plugins: readonly unknown[],
  context: DocKeyboardHandlerRegistrationContext,
): () => void {
  const unregisterHandlers: Array<() => void> = [];
  const registrar: DocKeyboardHandlerRegistrationContext = {
    commands: context.commands,
    bindings: createDocKeyboardBindingRegistrationRecorder(context.bindings, unregisterHandlers),
  };
  try {
    plugins.forEach(function registerDocPluginKeyboardHandler(plugin) {
      if (hasPluginKeyboardHandlerRegistrar(plugin)) plugin.registerKeyboardHandlers(registrar);
    });
  } catch (error) {
    unregisterRecordedKeyboardHandlers(unregisterHandlers);
    throw error;
  }
  return function unregisterDocPluginKeyboardHandlers(): void {
    unregisterRecordedKeyboardHandlers(unregisterHandlers);
  };
}

/** Registers every typed observation source contributed by document plugins. */
export function registerDocPluginObservations(plugins: readonly unknown[], observations: ObservationRegistry): void {
  plugins.forEach(function registerDocPluginObservation(plugin) {
    if (hasPluginObservationRegistrar<ObservationRegistry>(plugin)) plugin.registerObservations(observations);
  });
}

/** Registers every inline text-style contribution owned by document plugins. */
export function registerDocPluginInlineStyles(
  plugins: readonly unknown[],
  registry: RichTextInlineStyleRegistry,
): () => void {
  const unregisterContributions: Array<() => void> = [];
  const registrar = createDocInlineStyleRegistrationRecorder(registry, unregisterContributions);
  try {
    plugins.forEach(function registerDocPluginInlineStyle(plugin) {
      if (hasDocInlineStyleRegistrar(plugin)) plugin.registerInlineStyles(registrar);
    });
  } catch (error) {
    unregisterRecordedDocInlineStyles(unregisterContributions);
    throw error;
  }
  return function unregisterDocPluginInlineStyles(): void {
    unregisterRecordedDocInlineStyles(unregisterContributions);
  };
}

/** Registers every rich-text run renderer contributed by document plugins. */
export function registerDocPluginInlineStyleRenderers(
  plugins: readonly unknown[],
  registry: RichTextRunRenderRegistry,
): () => void {
  const unregisterContributions: Array<() => void> = [];
  const registrar = createDocInlineStyleRenderRegistrationRecorder(registry, unregisterContributions);
  try {
    plugins.forEach(function registerDocPluginInlineStyleRenderer(plugin) {
      if (hasDocInlineStyleRenderRegistrar(plugin)) plugin.registerInlineStyleRenderers(registrar);
    });
  } catch (error) {
    unregisterRecordedDocInlineStyleRenderers(unregisterContributions);
    throw error;
  }
  return function unregisterDocPluginInlineStyleRenderers(): void {
    unregisterRecordedDocInlineStyleRenderers(unregisterContributions);
  };
}

/** Registers every rich-text line box contribution owned by document plugins. */
export function registerDocPluginLineBoxes(plugins: readonly unknown[], registry: RichTextLineBoxRegistry): () => void {
  const unregisterContributions: Array<() => void> = [];
  const registrar = createDocLineBoxRegistrationRecorder(registry, unregisterContributions);
  try {
    plugins.forEach(function registerDocPluginLineBox(plugin) {
      if (hasDocLineBoxRegistrar(plugin)) plugin.registerLineBoxes(registrar);
    });
  } catch (error) {
    unregisterRecordedDocLineBoxes(unregisterContributions);
    throw error;
  }
  return function unregisterDocPluginLineBoxes(): void {
    unregisterRecordedDocLineBoxes(unregisterContributions);
  };
}

/** Registers every top-level block flow contribution owned by document plugins. */
export function registerDocPluginBlockFlows(
  plugins: readonly unknown[],
  registry: RichTextBlockFlowRegistry,
): () => void {
  const unregisterContributions: Array<() => void> = [];
  const registrar = createDocBlockFlowRegistrationRecorder(registry, unregisterContributions);
  try {
    plugins.forEach(function registerDocPluginBlockFlow(plugin) {
      if (hasDocBlockFlowRegistrar(plugin)) plugin.registerBlockFlows(registrar);
    });
  } catch (error) {
    unregisterRecordedDocBlockFlows(unregisterContributions);
    throw error;
  }
  return function unregisterDocPluginBlockFlows(): void {
    unregisterRecordedDocBlockFlows(unregisterContributions);
  };
}

/** Registers every local session-state adapter contributed by document plugins. */
export function registerDocPluginSessionStates(plugins: readonly unknown[], registry: SessionStateRegistry): void {
  plugins.forEach(function registerDocPluginSessionState(plugin) {
    if (hasPluginSessionStateRegistrar<SessionStateRegistry>(plugin)) plugin.registerSessionState(registry);
  });
}

/** Publishes every typed runtime capability contributed by document plugins. */
export function registerDocPluginCapabilities(
  plugins: readonly unknown[],
  registry: DocRuntimeExtensionRegistry,
): void {
  plugins.forEach(function registerDocPluginCapability(plugin) {
    if (hasPluginRuntimeCapabilityRegistrar<DocRuntimeExtensionRegistry>(plugin)) {
      plugin.registerCapabilities(registry);
    }
  });
}

interface DocInlineStyleRegistrar {
  registerInlineStyles(registry: RichTextInlineStyleRegistry): void;
}

interface DocKeyboardHandlerRegistrar {
  registerKeyboardHandlers(context: DocKeyboardHandlerRegistrationContext): void;
}

function hasPluginKeyboardHandlerRegistrar(plugin: unknown): plugin is DocKeyboardHandlerRegistrar {
  return typeof (plugin as { registerKeyboardHandlers?: unknown }).registerKeyboardHandlers === 'function';
}

function hasDocInlineStyleRegistrar(plugin: unknown): plugin is DocInlineStyleRegistrar {
  return typeof (plugin as { registerInlineStyles?: unknown }).registerInlineStyles === 'function';
}

interface DocLineBoxRegistrar {
  registerLineBoxes(registry: RichTextLineBoxRegistry): void;
}

interface DocBlockFlowRegistrar {
  registerBlockFlows(registry: RichTextBlockFlowRegistry): void;
}

interface DocInlineStyleRenderRegistrar {
  registerInlineStyleRenderers(registry: RichTextRunRenderRegistry): void;
}

function hasDocInlineStyleRenderRegistrar(plugin: unknown): plugin is DocInlineStyleRenderRegistrar {
  return typeof (plugin as { registerInlineStyleRenderers?: unknown }).registerInlineStyleRenderers === 'function';
}

function hasDocLineBoxRegistrar(plugin: unknown): plugin is DocLineBoxRegistrar {
  return typeof (plugin as { registerLineBoxes?: unknown }).registerLineBoxes === 'function';
}

function hasDocBlockFlowRegistrar(plugin: unknown): plugin is DocBlockFlowRegistrar {
  return typeof (plugin as { registerBlockFlows?: unknown }).registerBlockFlows === 'function';
}

function createDocInlineStyleRegistrationRecorder(
  registry: RichTextInlineStyleRegistry,
  unregisterContributions: Array<() => void>,
): RichTextInlineStyleRegistry {
  return createDocRegistryRegistrar(registry, (contribution: RichTextInlineStyleContribution) => {
    const unregister = registry.register(contribution);
    unregisterContributions.push(unregister);
    return unregister;
  });
}

function createDocInlineStyleRenderRegistrationRecorder(
  registry: RichTextRunRenderRegistry,
  unregisterContributions: Array<() => void>,
): RichTextRunRenderRegistry {
  return createDocRegistryRegistrar(registry, (contribution: RichTextRunRenderContribution) => {
    const unregister = registry.register(contribution);
    unregisterContributions.push(unregister);
    return unregister;
  });
}

function createDocLineBoxRegistrationRecorder(
  registry: RichTextLineBoxRegistry,
  unregisterContributions: Array<() => void>,
): RichTextLineBoxRegistry {
  return createDocRegistryRegistrar(registry, (contribution: RichTextLineBoxContribution) => {
    const unregister = registry.register(contribution);
    unregisterContributions.push(unregister);
    return unregister;
  });
}

function createDocBlockFlowRegistrationRecorder(
  registry: RichTextBlockFlowRegistry,
  unregisterContributions: Array<() => void>,
): RichTextBlockFlowRegistry {
  return createDocRegistryRegistrar(registry, (contribution: RichTextBlockFlowContribution) => {
    const unregister = registry.register(contribution);
    unregisterContributions.push(unregister);
    return unregister;
  });
}

function createDocRegistryRegistrar<Registry extends object, Contribution>(
  registry: Registry,
  register: (contribution: Contribution) => () => void,
): Registry {
  return new Proxy(registry, {
    get(target, property) {
      if (property === 'register') return register;
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function unregisterRecordedDocBlockFlows(unregisters: readonly (() => void)[]): void {
  for (let index = unregisters.length - 1; index >= 0; index--) unregisters[index]();
}

function createDocCommandRegistrationRecorder(
  commands: DocCommandBus,
  unregisterCommands: Array<() => void>,
): DocCommandBus {
  const register: DocCommandBus['register'] = function registerDocCommandAndRecord(definition, factory) {
    const unregister = commands.register(definition, factory);
    unregisterCommands.push(unregister);
    return unregister;
  } as DocCommandBus['register'];
  return new Proxy(commands, {
    get(target, property) {
      if (property === 'register') return register;
      const value = Reflect.get(target, property, target);
      if (Object.getOwnPropertyDescriptor(target, property)?.configurable === false) return value;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function createDocKeyboardBindingRegistrationRecorder(
  bindings: DocInputBindingRegistryCapability,
  unregisterHandlers: Array<() => void>,
): DocInputBindingRegistryCapability {
  return {
    registerTextHandlers: bindings.registerTextHandlers.bind(bindings),
    registerKeyboardHandlers(handlers: KeyboardRouterHandlers): () => void {
      const unregister = bindings.registerKeyboardHandlers(handlers);
      unregisterHandlers.push(unregister);
      return unregister;
    },
  };
}

function unregisterRecordedDocCommands(unregisterCommands: Array<() => void>): void {
  for (let index = unregisterCommands.length - 1; index >= 0; index--) unregisterCommands[index]();
  unregisterCommands.length = 0;
}

function unregisterRecordedKeyboardHandlers(unregisterHandlers: Array<() => void>): void {
  for (let index = unregisterHandlers.length - 1; index >= 0; index--) unregisterHandlers[index]();
  unregisterHandlers.length = 0;
}

function unregisterRecordedDocInlineStyles(unregisterContributions: Array<() => void>): void {
  for (let index = unregisterContributions.length - 1; index >= 0; index--) unregisterContributions[index]();
  unregisterContributions.length = 0;
}

function unregisterRecordedDocInlineStyleRenderers(unregisterContributions: Array<() => void>): void {
  for (let index = unregisterContributions.length - 1; index >= 0; index--) unregisterContributions[index]();
  unregisterContributions.length = 0;
}

function unregisterRecordedDocLineBoxes(unregisterContributions: Array<() => void>): void {
  for (let index = unregisterContributions.length - 1; index >= 0; index--) unregisterContributions[index]();
  unregisterContributions.length = 0;
}
